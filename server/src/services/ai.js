import { openAsBlob } from "node:fs";
import { env } from "../config/env.js";
import { ApiError, upstreamError } from "../utils/errors.js";

async function request(path, options, signal = AbortSignal.timeout(env.AI_TIMEOUT_MS)) {
  try {
    return await fetch(env.AI_URL + path, {
      ...options, redirect: "error", signal,
      headers: { ...options.headers, "X-Internal-Key": env.INTERNAL_KEY }
    });
  } catch {
    if (signal.reason?.name === "TimeoutError") {
      throw new ApiError(504, "AI_TIMEOUT", "The AI service timed out.");
    }
    throw upstreamError();
  }
}

export async function submitPdf(doc, path) {
  const form = new FormData();
  form.set("doc_id", String(doc._id));
  form.set("user_id", String(doc.userId));
  form.set("file", await openAsBlob(path, { type: "application/pdf" }), doc.filename);
  const response = await request("/ingest", { method: "POST", body: form });
  await response.body?.cancel();
  if (response.status !== 202) throw upstreamError();
}

export async function deletePdf(id, userId) {
  const response = await request("/documents/" + id + "?" + new URLSearchParams({ user_id: String(userId) }),
    { method: "DELETE" });
  await response.body?.cancel();
  if (response.status === 404) return false;
  if (response.status !== 204) throw upstreamError();
  return true;
}

export async function askAi(payload, signal) {
  const response = await request("/ask", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload)
  }, signal);
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (response.status !== 200 || type !== "text/event-stream" || !response.body) {
    await response.body?.cancel();
    throw upstreamError();
  }
  return response.body;
}
