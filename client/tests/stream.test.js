import assert from "node:assert/strict";
import { test } from "node:test";
import { readChatStream } from "../src/api/stream.js";

const source = { chunk_id: "c", doc_id: "d", filename: "notes.pdf", page: 4, text: "Café", score: 0.94 };
const sources = "event: sources\ndata: " + JSON.stringify([source]) + "\n\n";
const end = 'event: done\ndata: {"ok":true}\n\n';

function body(text, stride = 10) {
  const bytes = new TextEncoder().encode(text);
  let position = 0;
  return new ReadableStream({
    pull(controller) {
      if (position >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(position, position + stride));
      position += stride;
    }
  });
}

test("decodes fragmented UTF-8, comments, CRLF, spaces and multiline tokens", async () => {
  const frames = "\ufeff: ping\n\nevent: token\ndata: Café 📖\ndata: \n\nevent: token\ndata:  two\n\n" + sources + end;
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const stride of [1, 2, 9, 1024]) {
      const tokens = [], refs = [];
      await readChatStream(body(frames.replaceAll("\n", newline), stride), (t) => tokens.push(t), (s) => refs.push(s));
      assert.deepEqual(tokens, ["Café 📖\n", " two"]);
      assert.deepEqual(refs, [[source]]);
    }
  }
});

test("accepts an empty sources list and a done event with an empty data field", async () => {
  const refs = [];
  await readChatStream(body("event: sources\ndata: []\n\nevent: done\ndata:\n\n"), () => {}, (s) => refs.push(s));
  assert.deepEqual(refs, [[]]);
});

test("reports truncated streams, provider failures and malformed metadata", async () => {
  const cases = [
    [sources, /connection closed/i], [end, /before its sources/i],
    [sources + 'event: done\ndata: {"ok":false,"error":"Service offline"}\n\n', /Service offline/],
    ["event: sources\ndata: [1]\n\n", /invalid sources/],
    ["event: sources\ndata: [\n\n", /unreadable source information/],
    [sources + "event: token\ndata: late\n\n", /after its sources/],
    [sources + "event: done\ndata: false\n\n", /invalid completion/]
  ];
  for (const [wire, error] of cases) await assert.rejects(readChatStream(body(wire), () => {}, () => {}), error);
});

test("aborting a pending read cancels the transport and releases its lock", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const pending = readChatStream(stream, () => {}, () => {}, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
