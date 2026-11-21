import { once } from "node:events";
import { createParser } from "eventsource-parser";
import { upstreamError } from "../utils/errors.js";
import { sources as sourceList } from "../utils/validation.js";
import { releaseTurn, saveAnswer } from "./turns.js";

function json(data) {
  try { return JSON.parse(data); } catch { throw upstreamError(); }
}

export async function relay(body, res, signal, turn) {
  const tokens = [];
  const allowed = new Set(turn.payload.doc_ids);
  let sources, done;
  let finalized = false;
  const decoder = new TextDecoder();
  const parser = createParser({
    maxBufferSize: 16 * 1024 * 1024,
    onError(error) {
      if (error.type === "max-buffer-size-exceeded") throw upstreamError();
    },
    onEvent({ event, data }) {
      if (done !== undefined) throw upstreamError();
      if (event === "token") {
        if (sources !== undefined) throw upstreamError();
        tokens.push(data);
      } else if (event === "sources") {
        const parsed = sourceList.safeParse(json(data));
        if (sources !== undefined || !parsed.success || parsed.data.some((s) => !allowed.has(s.doc_id))) {
          throw upstreamError();
        }
        sources = parsed.data;
      } else if (event === "done") {
        const status = data ? json(data) : {};
        if (sources === undefined || !status || typeof status !== "object" || Array.isArray(status)
            || (status.ok !== undefined && typeof status.ok !== "boolean")) throw upstreamError();
        done = status.ok ?? true;
      }
    }
  });

  for await (const bytes of body) {
    signal.throwIfAborted();
    parser.feed(decoder.decode(bytes, { stream: true }));
    if (done !== undefined && !finalized) {
      // Commit before the client can observe the complete successful done frame.
      if (done) await saveAnswer(turn, tokens.join(""), sources);
      else await releaseTurn(turn);
      finalized = true;
    }
    // Parsing is a side channel. Forward the original bytes, including comments and line endings.
    if (!res.write(bytes)) await once(res, "drain", { signal });
  }
  if (!finalized) throw upstreamError();
}
