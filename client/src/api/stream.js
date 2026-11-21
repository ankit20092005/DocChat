import { createParser } from "eventsource-parser";

function metadata(data) {
  try { return JSON.parse(data); } catch { throw new Error("The answer contained unreadable source information."); }
}

export async function readChatStream(body, onToken, onSources, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let complete = false;
  let sawSources = false;
  const parser = createParser({
    maxBufferSize: 16 * 1024 * 1024,
    onError(error) {
      if (error.type === "max-buffer-size-exceeded") throw new Error("The answer was too large to display.");
    },
    onEvent({ event, data }) {
      if (complete) return;
      if (event === "token") {
        if (sawSources) throw new Error("The server sent answer text after its sources.");
        onToken(data);
      }
      if (event === "sources") {
        const sources = metadata(data);
        if (sawSources || !Array.isArray(sources) || sources.some((s) => !s || typeof s.filename !== "string" ||
            !Number.isInteger(s.page) || s.page < 1 || typeof s.text !== "string" || !Number.isFinite(s.score))) {
          throw new Error("The server returned invalid sources.");
        }
        sawSources = true;
        onSources(sources);
      }
      if (event === "done") {
        const status = data ? metadata(data) : {};
        if (!status || typeof status !== "object" || Array.isArray(status) ||
            (status.ok !== undefined && typeof status.ok !== "boolean")) throw new Error("The server sent an invalid completion event.");
        if (status.ok === false) throw new Error(typeof status.error === "string" ? status.error : "Answer generation was interrupted.");
        if (!sawSources) throw new Error("The answer ended before its sources arrived.");
        complete = true;
      }
    }
  });
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (!complete) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        parser.feed(decoder.decode());
        if (!complete) throw new Error("The connection closed before the answer was complete.");
        break;
      }
      // A transport chunk can end in the middle of a UTF-8 character or SSE field.
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
