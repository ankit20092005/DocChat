import asyncio
import logging
from collections.abc import AsyncIterator

import httpx
from httpx_sse import SSEError, aconnect_sse

from .config import Settings, get_settings
from .prompts import Prompt

log = logging.getLogger(__name__)


class GenerationError(Exception):
    """Safe to return to the caller, including after response headers were sent."""


def provider_request(settings: Settings, prompt: Prompt):
    if settings.llm_provider == "groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.groq_api_key.get_secret_value()}"}
        body = {
            "model": settings.groq_model, "stream": True,
            "messages": [{"role": "system", "content": prompt.system},
                         {"role": "user", "content": prompt.user}],
        }
    else:
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{settings.gemini_model}:streamGenerateContent?alt=sse")
        headers = {"x-goog-api-key": settings.gemini_api_key.get_secret_value()}
        body = {
            "systemInstruction": {"parts": [{"text": prompt.system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt.user}]}],
        }
    return url, headers, body


def read_delta(provider: str, data: dict) -> tuple[str, str | None]:
    if "error" in data or data.get("promptFeedback", {}).get("blockReason"):
        raise GenerationError("The provider could not complete the answer.")
    if provider == "groq":
        choices = data.get("choices", [])
        if not choices:
            return "", None
        choice = choices[0]
        return choice.get("delta", {}).get("content") or "", choice.get("finish_reason")
    candidates = data.get("candidates", [])
    if not candidates:
        return "", None
    candidate = candidates[0]
    parts = candidate.get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    return text, candidate.get("finishReason")


async def generate_stream(prompt: Prompt) -> AsyncIterator[str]:
    settings = get_settings()
    url, headers, body = provider_request(settings, prompt)
    emitted = complete = False
    try:
        async with asyncio.timeout(settings.llm_timeout_seconds):
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                async with aconnect_sse(client, "POST", url, headers=headers, json=body) as stream:
                    stream.response.raise_for_status()
                    async for event in stream.aiter_sse():
                        if event.event == "error":
                            raise GenerationError("The provider interrupted the answer.")
                        if not event.data:
                            continue
                        if settings.llm_provider == "groq" and event.data == "[DONE]":
                            complete = True
                            break
                        piece, reason = read_delta(settings.llm_provider, event.json())
                        if not isinstance(piece, str):
                            raise GenerationError("The provider returned invalid token data.")
                        if reason and reason.lower() != "stop":
                            raise GenerationError("The provider stopped before completing the answer.")
                        if piece:
                            emitted = True
                            yield piece
                        if reason:
                            complete = True
                            break
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise GenerationError("Answer generation timed out.") from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        log.warning("Generation provider=%s HTTP status=%d", settings.llm_provider, status)
        raise GenerationError(f"Generation provider returned HTTP {status}.") from exc
    except (httpx.HTTPError, SSEError, ValueError, TypeError, AttributeError, KeyError) as exc:
        raise GenerationError("The generation provider returned an invalid or interrupted stream.") from exc
    if not (emitted and complete):
        raise GenerationError("The generation provider returned an incomplete answer.")
