import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { rmdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { test as base } from "@playwright/test";
import { createServer as createVite } from "vite";

// Exercise the project's actual auth, uploads, history and SSE relay in an isolated database.
const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const mongoose = serverRequire("mongoose");
const { MongoMemoryReplSet } = serverRequire("mongodb-memory-server-core");
const address = (server) => "http://127.0.0.1:" + server.address().port;
const listen = async (server) => { server.listen(0, "127.0.0.1"); await once(server, "listening"); };
async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

export const test = base.extend({
  site: [async ({}, use) => {
    const key = randomBytes(32).toString("hex");
    const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    let vite, models, uploadDir;
    const cancellations = [];
    async function ai(req, res) {
      if (req.headers["x-internal-key"] !== key) return res.writeHead(403).end();
      if (req.url === "/ingest") {
        const form = await new Response(req, { headers: req.headers }).formData();
        const filter = { _id: form.get("doc_id"), userId: form.get("user_id") };
        const scanned = form.get("file").name === "scan.pdf";
        // Keep the upload and processing states observable across separate HTTP requests.
        await delay(350);
        res.writeHead(202).end();
        await delay(700);
        await models.Document.updateOne(filter, { $set: scanned ?
          { status: "failed", error: "scanned PDF, OCR not supported" } : { status: "ready", pages: 4 } });
      } else if (req.url === "/ask") {
        const ask = await new Response(req).json();
        const doc = await models.Document.findOne({ _id: ask.doc_ids[0], userId: ask.user_id });
        const ref = { doc_id: doc.id, chunk_id: String(new mongoose.Types.ObjectId()), filename: doc.filename,
          page: 4, text: "The study counted twelve workshops.", score: 0.923 };
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("event: token\ndata: The study counted **twelve**\n\n");
        if (ask.question === "Keep reading") {
          res.once("close", () => cancellations.push(ask.question));
          return;
        }
        await delay(500);
        res.end("event: token\ndata:  workshops. [" + doc.filename + ", p.4]\n\n" +
          "event: sources\ndata: " + JSON.stringify([ref]) + "\n\n" + 'event: done\ndata: {"ok":true}\n\n');
      } else if (req.method === "DELETE") {
        const url = new URL(req.url, "http://localhost");
        const result = await models.Document.deleteOne({ _id: url.pathname.split("/").at(-1), userId: url.searchParams.get("user_id") });
        res.writeHead(result.deletedCount ? 204 : 404).end();
      } else res.writeHead(404).end();
    }
    const upstream = createServer((req, res) => ai(req, res).catch(() => res.destroy()));
    const backend = createServer();
    try {
      await listen(upstream);
      await listen(backend);
      process.env.VITE_API_URL = address(backend) + "/api";
      vite = await createVite({ mode: "test", logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
      await vite.listen();
      const origin = address(vite.httpServer);
      Object.assign(process.env, { MONGODB_URI: mongo.getUri(), MONGODB_DB: "docchat_browser_test",
        JWT_SECRET: randomBytes(32).toString("hex"), INTERNAL_KEY: key, AI_URL: address(upstream),
        CLIENT_URL: origin, AI_TIMEOUT_MS: "30000", TRUST_PROXY_HOPS: "0", PORT: String(backend.address().port) });
      const { app } = await import("../../server/src/app.js");
      models = await import("../../server/src/models/index.js");
      ({ uploadDir } = await import("../../server/src/middleware/upload.js"));
      await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
      await Promise.all(Object.values(models).map((model) => model.init()));
      backend.on("request", app);
      await use({ origin, cancellations });
    } finally {
      await vite?.close();
      await close(backend);
      await close(upstream);
      await mongoose.disconnect();
      await mongo.stop();
      if (uploadDir) await rmdir(uploadDir);
    }
  }, { scope: "worker", timeout: 120000 }],
  baseURL: async ({ site }, use) => { await use(site.origin); }
});
