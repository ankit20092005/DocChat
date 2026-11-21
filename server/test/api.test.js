import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readdir, rmdir } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

let mongo, upstream, server, base, models, uploadDir;
const key = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const pdf = Buffer.from("%PDF-1.7\nsample");
const asks = [], uploads = [], deletions = [];
const clientGone = Promise.withResolvers();
const beforeHeaders = Promise.withResolvers();
const cancelledBeforeHeaders = Promise.withResolvers();
const objectId = () => new mongoose.Types.ObjectId();
const root = (listener) => "http://127.0.0.1:" + listener.address().port;
const latest = (items) => items.at(-1);

function wire(sources, ok = true) {
  const frames = [": keepalive", "event: token\r\ndata: Café\r\ndata: line ",
    "event: token\r\ndata: [policy.pdf, p.1]", "event: sources\r\ndata: " + JSON.stringify(sources),
    "event: done\r\ndata: " + JSON.stringify({ ok })];
  return frames.join("\r\n\r\n") + "\r\n\r\n";
}

async function fakeAi(req, res) {
  assert.equal(req.headers["x-internal-key"], key);
  if (req.url === "/ingest") {
    const form = await new Response(req, { headers: req.headers }).formData();
    const file = form.get("file");
    uploads.push({ id: form.get("doc_id"), user: form.get("user_id"), filename: file.name, size: file.size });
    res.writeHead(file.name === "reject.pdf" ? 503 : 202).end();
  } else if (req.url === "/ask") {
    const ask = await new Response(req).json();
    asks.push(ask);
    if (ask.question === "unavailable") return res.writeHead(503).end("upstream detail");
    if (ask.question === "wait for headers") {
      res.once("close", () => cancelledBeforeHeaders.resolve());
      beforeHeaders.resolve();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (ask.question === "hold") {
      res.once("close", () => clientGone.resolve());
      return res.write("event: token\ndata: Waiting\n\n");
    }
    if (ask.question === "truncate") return res.end("event: token\ndata: Incomplete\n\n");
    if (ask.question === "abstain") {
      return res.end("event: token\ndata: I couldn't find this in your documents.\n\n" +
        'event: sources\ndata: []\n\nevent: done\ndata: {"ok": true}\n\n');
    }
    const ok = ask.question !== "failed";
    const refs = ok ? [{ chunk_id: String(objectId()), doc_id: ask.doc_ids[0], filename: "policy.pdf",
      page: 1, text: "Policy", score: 0.91 }] : [];
    const bytes = Buffer.from(wire(refs, ok));
    const split = bytes.indexOf(Buffer.from("é")) + 1;
    res.write(bytes.subarray(0, split));
    await delay(5);
    res.end(bytes.subarray(split));
  } else if (req.method === "DELETE") {
    const url = new URL(req.url, root(upstream));
    const filter = { _id: url.pathname.split("/").pop(), userId: url.searchParams.get("user_id") };
    deletions.push(filter);
    const result = await models.Document.deleteOne(filter);
    res.writeHead(result.deletedCount ? 204 : 404).end();
  } else {
    res.writeHead(404).end();
  }
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  upstream = createServer((req, res) => fakeAi(req, res).catch(() => res.destroy()));
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  Object.assign(process.env, {
    MONGODB_URI: mongo.getUri(), MONGODB_DB: "docchat_test", JWT_SECRET: randomBytes(32).toString("hex"),
    INTERNAL_KEY: key, AI_URL: root(upstream), CLIENT_URL: "http://localhost:5173", TRUST_PROXY_HOPS: "0",
    AI_TIMEOUT_MS: "30000", PORT: "4000"
  });
  const { app } = await import("../src/app.js");
  models = await import("../src/models/index.js");
  ({ uploadDir } = await import("../src/middleware/upload.js"));
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
  await Promise.all(Object.values(models).map((model) => model.init()));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = root(server);
});

after(async () => {
  for (const listener of [server, upstream]) {
    if (!listener) continue;
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
  }
  await mongoose.disconnect();
  await mongo?.stop();
  if (uploadDir) await rmdir(uploadDir);
});

function api(method, path, token, data, options = {}) {
  const headers = token ? { Authorization: "Bearer " + token } : {};
  let body = data;
  if (data !== undefined && !(data instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }
  return fetch(base + "/api" + path, { method, body, headers, ...options });
}

async function account() {
  const email = randomUUID() + "@example.org";
  const response = await api("POST", "/auth/register", null, { email, password });
  assert.equal(response.status, 201);
  return response.json();
}

function upload(token, filename = "policy.pdf", bytes = pdf) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
  return api("POST", "/documents", token, form);
}

function doc(userId, status = "ready", sizeBytes = pdf.length) {
  return { userId, filename: "policy.pdf", sizeBytes, status };
}

test("health, CORS, JWT auth and validation", async () => {
  const health = await fetch(base + "/health", { headers: { Origin: process.env.CLIENT_URL } });
  assert.equal(health.headers.get("access-control-allow-origin"), process.env.CLIENT_URL);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.equal((await fetch(base + "/health", { headers: { Origin: "http://other.invalid" } })).status, 403);
  assert.equal((await api("GET", "/documents")).status, 401);
  const { token, user } = await account();
  assert.deepEqual(await (await api("GET", "/auth/me", token)).json(), user);
  assert.equal((await api("GET", "/auth/me", token + "x")).status, 401);
  const body = { email: user.email.toUpperCase(), password };
  assert.equal((await api("POST", "/auth/register", null, body)).status, 409);
  assert.equal((await api("POST", "/auth/login", null, body)).status, 200);
  assert.equal((await api("POST", "/auth/login", null, { ...body, password: "wrong" })).status, 401);
  assert.equal((await api("POST", "/auth/register", null, { ...body, password: "é".repeat(37) })).status, 400);
  assert.equal((await api("GET", "/documents/bad", token)).status, 400);
});

test("file validation, forwarding, failure status, and disk cleanup", async () => {
  const { token, user } = await account();
  const invalid = await upload(token, "fake.pdf", Buffer.from("text"));
  assert.equal(invalid.status, 415);
  assert.equal((await invalid.json()).error.code, "INVALID_PDF");
  const oversized = await upload(token, "large.pdf", Buffer.alloc(50 * 1024 * 1024 + 1));
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "FILE_TOO_LARGE");
  const boundary = Buffer.alloc(50 * 1024 * 1024);
  pdf.copy(boundary);
  const response = await upload(token, "pól[i]cy.pdf", boundary);
  assert.equal(response.status, 202);
  const saved = await response.json();
  assert.deepEqual(latest(uploads), { user: user._id, id: saved._id, filename: "pól_i_cy.pdf", size: boundary.length });
  assert.equal((await (await api("GET", "/documents/" + saved._id, token)).json()).status, "processing");
  assert.equal((await upload(token, "reject.pdf")).status, 502);
  assert.equal((await models.Document.findOne({ userId: user._id, filename: "reject.pdf" })).status, "failed");
  assert.deepEqual(await readdir(uploadDir), []);
});

test("parallel uploads cannot exceed either quota", async () => {
  for (const sizes of [Array(9).fill(1), [50, 50, 50, 50].map((n, i) => n * 1024 * 1024 - (i === 0 ? pdf.length : 0))]) {
    const { token, user } = await account();
    await models.Document.insertMany(sizes.map((size) => doc(user._id, "ready", size)));
    const replies = await Promise.all([upload(token), upload(token)]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [202, 409]);
    assert.equal(await models.Document.countDocuments({ userId: user._id }), sizes.length + 1);
  }
});

test("owner isolation, document unlinking, conversation CRUD and cascade", async () => {
  const a = await account(), b = await account();
  const file = await models.Document.create(doc(a.user._id));
  const path = "/documents/" + file.id;
  const input = { title: "Policies", docIds: [file.id] };
  const conv = await (await api("POST", "/conversations", a.token, input)).json();
  const chat = "/conversations/" + conv._id;
  assert.deepEqual(await (await api("GET", "/documents", b.token)).json(), []);
  assert.deepEqual(await (await api("GET", "/conversations", b.token)).json(), []);
  const previous = deletions.length;
  for (const [method, route, data] of [["GET", path], ["DELETE", path], ["POST", "/conversations", input],
    ["PATCH", chat, { title: "X" }], ["DELETE", chat], ["GET", chat + "/messages"],
    ["POST", chat + "/messages", { content: "X" }]]) {
    assert.equal((await api(method, route, b.token, data)).status, 404);
  }
  assert.equal(deletions.length, previous);
  const foreign = await models.Document.create(doc(b.user._id));
  assert.equal((await api("PATCH", chat, a.token, { docIds: [foreign.id] })).status, 404);
  assert.equal((await (await api("PATCH", chat, a.token, { title: "Updated" })).json()).title, "Updated");
  assert.equal((await api("DELETE", path, a.token)).status, 204);
  assert.deepEqual(latest(deletions), { _id: file.id, userId: a.user._id });
  assert.deepEqual((await (await api("GET", "/conversations", a.token)).json())[0].docIds, []);
  assert.equal((await api("POST", chat + "/messages", a.token, { content: "Hi" })).status, 409);
  await models.Message.create({ conversationId: conv._id, role: "user", content: "Old" });
  assert.equal((await api("DELETE", chat, a.token)).status, 204);
  assert.equal(await models.Message.countDocuments({ conversationId: conv._id }), 0);
});

test("raw SSE bytes, last four prior messages, ready documents, and successful persistence", async () => {
  const { user, token } = await account();
  const [ready, pending] = await models.Document.create([doc(user._id), doc(user._id, "processing")]);
  const conv = await models.Conversation.create({ userId: user._id, title: "Chat", docIds: [ready._id, pending._id] });
  const history = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i }));
  await models.Message.insertMany(history.map((m, i) => ({ ...m, conversationId: conv._id, createdAt: new Date(1000 + i) })));
  const path = "/conversations/" + conv.id + "/messages";
  const reply = await api("POST", path, token, { content: "refund?" });
  const bytes = Buffer.from(await reply.arrayBuffer());
  assert.deepEqual(latest(asks), { user_id: user._id, question: "refund?", doc_ids: [ready.id], history: history.slice(-4) });
  const messages = await (await api("GET", path, token)).json();
  const answer = latest(messages);
  assert.equal(answer.content, "Café\nline [policy.pdf, p.1]");
  assert.equal(answer.sources[0].doc_id, ready.id);
  assert.equal(answer.role, "assistant");
  assert.equal(messages.at(-2).content, "refund?");
  assert.deepEqual(bytes, Buffer.from(wire(answer.sources)));
  for (const content of ["failed", "unavailable", "truncate"]) {
    const request = api("POST", path, token, { content });
    if (content === "truncate") await assert.rejects(async () => (await request).text());
    else if (content === "unavailable") assert.equal((await request).status, 502);
    else assert.equal(await (await request).text(), wire([], false));
  }
  assert.equal(await models.Message.countDocuments({ conversationId: conv._id, role: "assistant" }), 4);
  await (await api("POST", path, token, { content: "abstain" })).text();
  const refusal = latest(await (await api("GET", path, token)).json());
  assert.equal(refusal.content, "I couldn't find this in your documents.");
  assert.deepEqual(refusal.sources, []);
});

test("client disconnect aborts upstream, releases the conversation, and drops the partial answer", async () => {
  const { user, token } = await account();
  const file = await models.Document.create(doc(user._id));
  const conv = await models.Conversation.create({ userId: user._id, title: "Abort", docIds: [file._id] });
  const path = "/conversations/" + conv.id + "/messages";
  const controller = new AbortController();
  const reply = await api("POST", path, token, { content: "hold" }, { signal: controller.signal });
  await reply.body.getReader().read();
  assert.equal((await api("POST", path, token, { content: "second" })).status, 409);
  controller.abort();
  await Promise.race([clientGone.promise, delay(3000, null, { ref: false }).then(() => assert.fail("upstream stayed open"))]);
  for (let i = 0; i < 100 && await models.Conversation.exists({ _id: conv._id, activeTurn: { $exists: true } }); i++) {
    await delay(10);
  }
  assert.equal(await models.Message.countDocuments({ conversationId: conv._id }), 1);
  assert.equal(await models.Conversation.exists({ _id: conv._id, activeTurn: { $exists: true } }), null);
});

test("login is rate-limited with the API error envelope", async () => {
  let response;
  for (let i = 0; i < 11; i++) response = await api("POST", "/auth/login", null, {});
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, "RATE_LIMITED");
});

test("upload and chat limits are scoped to the authenticated account", async () => {
  const a = await account(), b = await account();
  const path = "/conversations/" + objectId() + "/messages";
  for (const [route, limit] of [["/documents", 20], [path, 30]]) {
    for (let i = 0; i < limit; i++) {
      assert.equal((await api("POST", route, a.token, {})).status, 400);
    }
    assert.equal((await api("POST", route, a.token, {})).status, 429);
    assert.equal((await api("POST", route, b.token, {})).status, 400);
  }
});

test("disconnect while waiting for upstream headers cancels the request", { timeout: 10000 }, async () => {
  const { user, token } = await account();
  const file = await models.Document.create(doc(user._id));
  const conv = await models.Conversation.create({ userId: user._id, title: "Waiting", docIds: [file._id] });
  const controller = new AbortController();
  const pending = api("POST", "/conversations/" + conv.id + "/messages", token,
    { content: "wait for headers" }, { signal: controller.signal });
  await beforeHeaders.promise;
  controller.abort();
  await assert.rejects(pending);
  await cancelledBeforeHeaders.promise;
  assert.equal(await models.Message.countDocuments({ conversationId: conv._id, role: "assistant" }), 0);
});
