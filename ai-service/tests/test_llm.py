import asyncio
import json
from functools import partial
from secrets import token_hex

import httpx
import pytest

from app import llm
from app.config import Settings
from app.prompts import Prompt


@pytest.mark.parametrize("provider", ["groq", "gemini"])
@pytest.mark.parametrize("outcome", ["answer", "truncated", "timeout", "rate_limit"])
def test_provider_stream(monkeypatch, provider, outcome):
    key = token_hex(32)
    settings = Settings(_env_file=None, mongodb_uri="mongodb://localhost", internal_key=key,
                        llm_provider=provider, groq_api_key=key, gemini_api_key=key)
    monkeypatch.setattr(llm, "get_settings", lambda: settings)

    def respond(request):
        if outcome == "timeout":
            raise httpx.ReadTimeout("test timeout", request=request)
        if outcome == "rate_limit":
            return httpx.Response(429)
        body = json.loads(request.content)
        if provider == "groq":
            assert request.headers["authorization"] == f"Bearer {key}"
            assert body["messages"][0] == {"role": "system", "content": "rules"}
            chunks = [{"choices": [{"delta": {"content": "Answer"}}]}]
            stop = {"choices": [{"delta": {}, "finish_reason": "stop"}]}
        else:
            assert request.headers["x-goog-api-key"] == key
            assert body["systemInstruction"]["parts"] == [{"text": "rules"}]
            parts = [{"thought": True, "text": "private"}, {"text": "Answer"}]
            chunks = [{"candidates": [{"content": {"parts": parts}}]}]
            stop = {"candidates": [{"finishReason": "STOP"}]}
        if outcome == "answer":
            chunks.append(stop)
        stream = "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks)
        return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, text=stream)

    client = partial(httpx.AsyncClient, transport=httpx.MockTransport(respond))
    monkeypatch.setattr(llm.httpx, "AsyncClient", client)

    async def collect():
        return [s async for s in llm.generate_stream(Prompt("rules", "question"))]

    if outcome == "answer":
        assert asyncio.run(collect()) == ["Answer"]
    else:
        with pytest.raises(llm.GenerationError):
            asyncio.run(collect())
