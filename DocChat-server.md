## server/package.json

~~~~json
{
  "name": "docchat-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.17.0" },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "bcrypt": "6.0.0",
    "cors": "2.8.6",
    "eventsource-parser": "4.1.3",
    "express": "5.3.0",
    "express-rate-limit": "8.7.5",
    "helmet": "8.3.0",
    "jsonwebtoken": "9.0.3",
    "mongoose": "9.12.2",
    "multer": "2.5.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "mongodb-memory-server-core": "11.3.0"
  }
}
~~~~

## server/.env.example

~~~~dotenv
PORT=4000
CLIENT_URL=http://localhost:5173
MONGODB_URI=
MONGODB_DB=docchat
JWT_SECRET=
AI_URL=http://127.0.0.1:8000
INTERNAL_KEY=
AI_TIMEOUT_MS=120000
TRUST_PROXY_HOPS=0
~~~~

## server/.gitignore

~~~~gitignore
node_modules/
.env
.env.*
!.env.example
~~~~

## server/src/app.js

~~~~javascript
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { handleError } from "./middleware/errors.js";
import { generalLimit } from "./middleware/security.js";
import { api } from "./routes/index.js";
import { ApiError, missing } from "./utils/errors.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.CLIENT_URL) return callback(null, true);
    callback(new ApiError(403, "ORIGIN_DENIED", "This origin is not allowed."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
}));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", generalLimit, express.json({ limit: "128kb" }), api);
app.use((req, res, next) => next(missing("Route")));
app.use(handleError);
~~~~

## server/src/config/env.js

~~~~javascript
import { loadEnvFile } from "node:process";
import { z } from "zod";

try {
  loadEnvFile(new URL("../../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const httpUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
});

const result = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: httpUrl.transform((value) => new URL(value).origin),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/.+/),
  MONGODB_DB: z.string().min(1).default("docchat"),
  JWT_SECRET: z.string().min(32),
  AI_URL: httpUrl.transform((value) => value.replace(/\/+$/, "")),
  INTERNAL_KEY: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(600000).default(120000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0)
}).safeParse(process.env);

if (!result.success) {
  const names = result.error.issues.map((issue) => issue.path.join("."));
  throw new Error("Invalid server configuration for " + names.join(", "));
}

export const env = Object.freeze(result.data);
export const maxFileBytes = 50 * 1024 * 1024;
export const maxUserBytes = 200 * 1024 * 1024;
export const maxDocuments = 10;
~~~~

## server/src/controllers/auth.js

~~~~javascript
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { signToken } from "../middleware/security.js";
import { ApiError } from "../utils/errors.js";
import { login as loginInput, registration } from "../utils/validation.js";

const cost = 12;
const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), cost);
const credentials = (user) => ({
  token: signToken(user._id), user: { _id: user._id, email: user.email }
});

export async function register(req, res) {
  const { email, password } = registration.parse(req.body);
  const passwordHash = await bcrypt.hash(password, cost);
  let user;
  try {
    user = await User.create({ email, passwordHash });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "EMAIL_IN_USE", "This email is already registered.");
    throw error;
  }
  res.status(201).json(credentials(user));
}

export async function login(req, res) {
  const { email, password } = loginInput.parse(req.body);
  const user = await User.findOne({ email }).select("+passwordHash").lean();
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  res.json(credentials(user));
}
~~~~

## server/src/controllers/conversations.js

~~~~javascript
import mongoose from "mongoose";
import { Conversation, Message } from "../models/index.js";
import { checkDocuments, lockUser, owned } from "../services/ownership.js";
import { missing } from "../utils/errors.js";
import { conversationPatch, newConversation } from "../utils/validation.js";

const fields = "_id userId title docIds createdAt updatedAt";

export async function list(req, res) {
  res.json(await Conversation.find({ userId: req.user._id }).select(fields).sort({ updatedAt: -1, _id: -1 }).lean());
}

export async function create(req, res) {
  const data = newConversation.parse(req.body);
  const userId = req.user._id;
  const conversation = await mongoose.connection.transaction(async (session) => {
    await lockUser(userId, session);
    await checkDocuments(userId, data.docIds, session);
    const [record] = await Conversation.create([{ ...data, userId }], { session });
    return record;
  });
  res.status(201).json(conversation);
}

export async function patch(req, res) {
  const data = conversationPatch.parse(req.body);
  const owner = owned(req);
  const result = await mongoose.connection.transaction(async (session) => {
    if (data.docIds) {
      await lockUser(owner.userId, session);
      await checkDocuments(owner.userId, data.docIds, session);
    }
    const record = await Conversation.findOneAndUpdate(owner, { $set: data },
      { session, returnDocument: "after" }).select(fields).lean();
    if (!record) throw missing("Conversation");
    return record;
  });
  res.json(result);
}

export async function remove(req, res) {
  const owner = owned(req);
  await mongoose.connection.transaction(async (session) => {
    const result = await Conversation.deleteOne(owner, { session });
    if (!result.deletedCount) throw missing("Conversation");
    await Message.deleteMany({ conversationId: owner._id }, { session });
  });
  res.status(204).end();
}
~~~~

## server/src/controllers/documents.js

~~~~javascript
import { rm } from "node:fs/promises";
import mongoose from "mongoose";
import { maxDocuments, maxUserBytes } from "../config/env.js";
import { verifyPdf } from "../middleware/upload.js";
import { Conversation, Document } from "../models/index.js";
import { deletePdf, submitPdf } from "../services/ai.js";
import { lockUser, owned } from "../services/ownership.js";
import { ApiError, missing, upstreamError } from "../utils/errors.js";

const fields = "_id userId filename sizeBytes pages status error createdAt updatedAt";

export async function create(req, res) {
  const userId = req.user._id;
  let doc;
  try {
    const filename = await verifyPdf(req.file);
    const sizeBytes = req.file.size;
    doc = await mongoose.connection.transaction(async (session) => {
      await lockUser(userId, session);
      const current = await Document.find({ userId }).select("sizeBytes").session(session).lean();
      const total = current.reduce((sum, item) => sum + item.sizeBytes, sizeBytes);
      if (current.length >= maxDocuments || total > maxUserBytes) {
        throw new ApiError(409, "DOCUMENT_QUOTA", "Your library allows 10 documents and 200 MiB total.");
      }
      const [record] = await Document.create([{ userId, filename, sizeBytes }], { session });
      return record;
    });
    try {
      await submitPdf(doc, req.file.path);
    } catch (error) {
      // An acknowledgement can be lost after FastAPI has already claimed the job.
      await Document.updateOne({ _id: doc._id, userId, status: "processing", ingestId: { $exists: false } },
        { $set: { status: "failed", error: "The PDF could not be submitted for processing." } });
      throw error;
    }
  } finally {
    if (req.file) await rm(req.file.path, { force: true });
  }
  res.status(202).json(doc);
}

export async function list(req, res) {
  res.json(await Document.find({ userId: req.user._id }).select(fields).sort({ createdAt: -1, _id: -1 }).lean());
}

export async function get(req, res) {
  const doc = await Document.findOne(owned(req)).select(fields).lean();
  if (!doc) throw missing("Document");
  res.json(doc);
}

export async function remove(req, res) {
  const owner = owned(req);
  const links = { userId: owner.userId, docIds: owner._id };
  const unlink = { $pull: { docIds: owner._id } };
  const existed = await Document.exists(owner);
  if (existed) {
    const deleted = await deletePdf(owner._id, owner.userId);
    if (!deleted && await Document.exists(owner)) throw upstreamError();
  }
  await mongoose.connection.transaction(async (session) => {
    await lockUser(owner.userId, session);
    // FastAPI removes the row and chunks. A retry can still need to unlink conversations.
    if (existed) await Document.deleteOne(owner, { session });
    await Conversation.updateMany(links, unlink, { session });
  });
  if (!existed) throw missing("Document");
  res.status(204).end();
}
~~~~

## server/src/controllers/messages.js

~~~~javascript
import { env } from "../config/env.js";
import { Conversation, Message } from "../models/index.js";
import { askAi } from "../services/ai.js";
import { owned } from "../services/ownership.js";
import { relay } from "../services/relay.js";
import { releaseTurn, startTurn } from "../services/turns.js";
import { ApiError, missing } from "../utils/errors.js";
import { newMessage } from "../utils/validation.js";

export async function list(req, res) {
  const owner = owned(req);
  if (!await Conversation.exists(owner)) throw missing("Conversation");
  res.json(await Message.find({ conversationId: owner._id }).select("-__v").sort({ createdAt: 1, _id: 1 }).lean());
}

export async function send(req, res) {
  const { content } = newMessage.parse(req.body);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(env.AI_TIMEOUT_MS)]);
  const disconnect = () => controller.abort();
  res.once("close", disconnect);
  let turn;
  try {
    if (res.destroyed) return;
    turn = await startTurn(owned(req), content);
    signal.throwIfAborted();
    const body = await askAi(turn.payload, signal);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();
    await relay(body, res, signal, turn);
    res.end();
  } catch (error) {
    controller.abort();
    if (turn) await releaseTurn(turn);
    if (res.destroyed) return;
    if (!res.headersSent && signal.reason?.name === "TimeoutError") {
      throw new ApiError(504, "AI_TIMEOUT", "The AI service timed out.");
    }
    throw error;
  } finally {
    res.off("close", disconnect);
  }
}
~~~~

## server/src/index.js

~~~~javascript
import { once } from "node:events";
import { rmdir } from "node:fs/promises";
import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { uploadDir } from "./middleware/upload.js";
import { User, Document, Conversation, Message } from "./models/index.js";

try {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB, serverSelectionTimeoutMS: 8000 });
  await Promise.all([User, Document, Conversation, Message].map((model) => model.init()));
  const server = app.listen(env.PORT);
  await once(server, "listening");
  console.info("DocChat server listening on port", env.PORT);
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
} catch (error) {
  console.error("Server stopped", error.name);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await rmdir(uploadDir).catch((error) => console.error("Upload directory cleanup failed", error.code));
}
~~~~

## server/src/middleware/errors.js

~~~~javascript
import multer from "multer";
import { ZodError } from "zod";
import { ApiError, tooLarge } from "../utils/errors.js";

export function handleError(error, req, res, next) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  let problem = error;
  if (error instanceof ZodError) {
    const field = error.issues[0].path.join(".") || "request";
    problem = new ApiError(400, "INVALID_INPUT", "Invalid " + field + ".");
  } else if (error instanceof multer.MulterError) {
    problem = error.code === "LIMIT_FILE_SIZE" ? tooLarge()
      : new ApiError(400, "INVALID_UPLOAD", "Send one PDF in the file field.");
  } else if (error.type === "entity.parse.failed") {
    problem = new ApiError(400, "INVALID_JSON", "Send a valid JSON object.");
  } else if (error.type === "entity.too.large") {
    problem = new ApiError(413, "BODY_TOO_LARGE", "The request body is too large.");
  } else if (!(error instanceof ApiError) && error.status === 415) {
    problem = new ApiError(415, "UNSUPPORTED_MEDIA", "Unsupported request encoding or media type.");
  } else if (["MongoServerSelectionError", "MongooseServerSelectionError", "MongoNetworkError"].includes(error.name)) {
    problem = new ApiError(503, "DATABASE_UNAVAILABLE", "The document database is unavailable.");
  }
  if (!(problem instanceof ApiError)) {
    // Driver errors can contain URIs and duplicate values. Log only the error class.
    console.error("Request failed", error.name);
    problem = new ApiError(500, "INTERNAL_ERROR", "The request could not be completed.");
  }
  if (problem.status === 401) res.set("WWW-Authenticate", "Bearer");
  res.status(problem.status).json({ error: { code: problem.code, message: problem.message } });
}
~~~~

## server/src/middleware/security.js

~~~~javascript
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { ApiError, unauthorized } from "../utils/errors.js";
import { id } from "../utils/validation.js";

const issuer = "docchat-server";
const audience = "docchat-client";

export function signToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256", subject: String(userId), issuer, audience, expiresIn: "15m"
  });
}

export async function authenticate(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get("Authorization") ?? "");
  if (!match) throw unauthorized();
  let claims;
  try {
    claims = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ["HS256"], issuer, audience });
  } catch {
    throw unauthorized();
  }
  if (!id.safeParse(claims.sub).success) throw unauthorized();
  req.user = await User.findById(claims.sub).select("_id email").lean();
  if (!req.user) throw unauthorized();
  next();
}

function limiter(limit, perUser = false) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-7", legacyHeaders: false,
    ...(perUser && { keyGenerator: (req) => String(req.user._id) }),
    handler: (req, res, next) => next(new ApiError(429, "RATE_LIMITED", "Too many requests. Try again later."))
  });
}

export const generalLimit = limiter(300);
export const loginLimit = limiter(10);
export const uploadLimit = limiter(20, true);
export const chatLimit = limiter(30, true);
~~~~

## server/src/middleware/upload.js

~~~~javascript
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import multer from "multer";
import { maxFileBytes } from "../config/env.js";
import { ApiError, tooLarge } from "../utils/errors.js";

export const uploadDir = mkdtempSync(join(tmpdir(), "docchat-uploads-"));
const receiveFile = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => callback(null, randomUUID() + ".pdf")
  }),
  defParamCharset: "utf8",
  // Busboy signals its limit at equality. Allow exactly 50 MiB.
  limits: { fileSize: maxFileBytes + 1, files: 1, fields: 0, parts: 2 }
}).single("file");

export function upload(req, res, next) {
  receiveFile(req, res, (error) => {
    if (error && !(error instanceof multer.MulterError) && !error.code) {
      return next(new ApiError(400, "INVALID_UPLOAD", "The multipart upload could not be read."));
    }
    next(error);
  });
}

export async function verifyPdf(file) {
  if (!file) throw new ApiError(400, "FILE_REQUIRED", "Send a PDF in the file field.");
  if (file.size > maxFileBytes) throw tooLarge();
  const handle = await open(file.path, "r");
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (!header.equals(Buffer.from("%PDF-"))) {
      throw new ApiError(415, "INVALID_PDF", "The uploaded file must be a PDF.");
    }
  } finally {
    await handle.close();
  }
  const name = posix.basename(file.originalname.replaceAll("\\", "/")).normalize("NFC");
  const stem = name.replace(/\.pdf$/i, "").replace(/[\p{C}<>:"|?*\[\]]/gu, "_").trim();
  return (Array.from(stem).slice(0, 150).join("") || "document") + ".pdf";
}
~~~~

## server/src/models/index.js

~~~~javascript
import mongoose from "mongoose";

const { Schema, model } = mongoose;
const objectId = Schema.Types.ObjectId;
const options = { timestamps: true, toJSON: { versionKey: false } };

const user = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false }
}, options);

const document = new Schema({
  userId: { type: objectId, ref: "User", required: true },
  filename: { type: String, required: true },
  sizeBytes: { type: Number, required: true, min: 0 },
  pages: { type: Number, default: 0 },
  status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
  error: { type: String, default: null },
  // FastAPI sets this while it owns an ingestion attempt.
  ingestId: { type: objectId, select: false }
}, options);
document.index({ userId: 1, createdAt: -1 });

const conversation = new Schema({
  userId: { type: objectId, ref: "User", required: true },
  title: { type: String, required: true },
  docIds: [{ type: objectId, ref: "Document" }],
  activeTurn: { type: objectId, select: false },
  activeUntil: { type: Date, select: false }
}, options);
conversation.index({ userId: 1, updatedAt: -1 });

const source = new Schema({
  chunk_id: String, doc_id: String, filename: String, page: Number, text: String, score: Number
}, { _id: false });
const message = new Schema({
  conversationId: { type: objectId, ref: "Conversation", required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  sources: { type: [source], default: [] }
}, options);
message.index({ conversationId: 1, createdAt: -1, _id: -1 });

export const User = model("User", user, "users");
export const Document = model("Document", document, "documents");
export const Conversation = model("Conversation", conversation, "conversations");
export const Message = model("Message", message, "messages");
~~~~

## server/src/routes/index.js

~~~~javascript
import { Router } from "express";
import * as auth from "../controllers/auth.js";
import * as docs from "../controllers/documents.js";
import * as conversations from "../controllers/conversations.js";
import * as messages from "../controllers/messages.js";
import { authenticate, chatLimit, loginLimit, uploadLimit } from "../middleware/security.js";
import { upload } from "../middleware/upload.js";
import { id } from "../utils/validation.js";

export const api = Router();
api.post("/auth/register", auth.register);
api.post("/auth/login", loginLimit, auth.login);
api.use(authenticate);
api.param("id", (req, res, next, value) => {
  req.params.id = id.parse(value);
  next();
});
api.get("/auth/me", (req, res) => res.json(req.user));
api.route("/documents").get(docs.list).post(uploadLimit, upload, docs.create);
api.route("/documents/:id").get(docs.get).delete(docs.remove);
api.route("/conversations").get(conversations.list).post(conversations.create);
api.route("/conversations/:id").patch(conversations.patch).delete(conversations.remove);
api.route("/conversations/:id/messages").get(messages.list).post(chatLimit, messages.send);
~~~~

## server/src/services/ai.js

~~~~javascript
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
~~~~

## server/src/services/ownership.js

~~~~javascript
import { Document, User } from "../models/index.js";
import { missing, unauthorized } from "../utils/errors.js";

export function owned(req) {
  return { _id: req.params.id, userId: req.user._id };
}

export async function lockUser(userId, session) {
  // A real write serializes quota reservations and document links across processes.
  const result = await User.updateOne({ _id: userId }, { $inc: { __v: 1 } }, { session, timestamps: false });
  if (!result.matchedCount) throw unauthorized();
}

export async function checkDocuments(userId, docIds, session) {
  const count = await Document.countDocuments({ userId, _id: { $in: docIds } }).session(session);
  if (count !== docIds.length) throw missing("Document");
}
~~~~

## server/src/services/relay.js

~~~~javascript
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
~~~~

## server/src/services/turns.js

~~~~javascript
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Conversation, Document, Message } from "../models/index.js";
import { ApiError, missing } from "../utils/errors.js";

export async function startTurn(owner, content) {
  const activeTurn = new mongoose.Types.ObjectId();
  return mongoose.connection.transaction(async (session) => {
    const now = new Date();
    // Serialize a conversation across server processes. The deadline recovers a crashed worker.
    const conversation = await Conversation.findOneAndUpdate({
      ...owner, $or: [{ activeUntil: null }, { activeUntil: { $lte: now } }]
    }, { $set: { activeTurn, activeUntil: new Date(now.getTime() + env.AI_TIMEOUT_MS + 30000) } },
    { session, returnDocument: "after" }).select("docIds").lean();
    if (!conversation) {
      if (!await Conversation.exists(owner).session(session)) throw missing("Conversation");
      throw new ApiError(409, "CHAT_BUSY", "An answer is already streaming in this conversation.");
    }
    const ready = await Document.find({
      _id: { $in: conversation.docIds }, userId: owner.userId, status: "ready"
    }).select("_id").session(session).lean();
    if (!ready.length) throw new ApiError(409, "NO_READY_DOCUMENTS", "Select a document that is ready to chat.");

    const conversationId = owner._id;
    const history = await Message.find({ conversationId }).select("role content -_id")
      .sort({ createdAt: -1, _id: -1 }).limit(4).session(session).lean();
    await Message.create([{ conversationId, role: "user", content }], { session });
    return {
      filter: { ...owner, activeTurn },
      payload: { user_id: String(owner.userId), doc_ids: ready.map((doc) => String(doc._id)),
        question: content, history: history.reverse() }
    };
  });
}

const unlock = { $unset: { activeTurn: "", activeUntil: "" } };

export async function saveAnswer(turn, content, sources) {
  await mongoose.connection.transaction(async (session) => {
    const result = await Conversation.updateOne(turn.filter, unlock, { session });
    if (!result.matchedCount) throw missing("Active conversation");
    await Message.create([{ conversationId: turn.filter._id, role: "assistant", content, sources }], { session });
  });
}

export async function releaseTurn(turn) {
  await Conversation.updateOne(turn.filter, unlock);
}
~~~~

## server/src/utils/errors.js

~~~~javascript
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const missing = (name) => new ApiError(404, "NOT_FOUND", name + " not found.");
export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "A valid bearer token is required.");
export const upstreamError = () => new ApiError(502, "AI_UNAVAILABLE", "The AI service could not complete the request.");
export const tooLarge = () => new ApiError(413, "FILE_TOO_LARGE", "Choose a PDF of 50 MiB or less.");
~~~~

## server/src/utils/validation.js

~~~~javascript
import { z } from "zod";
import { maxDocuments } from "../config/env.js";

export const id = z.string().regex(/^[a-f\d]{24}$/i, "Expected a MongoDB ObjectId.")
  .transform((value) => value.toLowerCase());
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(1).refine((value) => Buffer.byteLength(value) <= 72,
  "Password must fit within 72 UTF-8 bytes.");
export const registration = z.strictObject({ email, password: password.min(8) });
export const login = z.strictObject({ email, password });

const title = z.string().trim().min(1).max(200);
const docIds = z.array(id).max(maxDocuments).refine((ids) => new Set(ids).size === ids.length,
  "Document IDs must be unique.");
export const newConversation = z.strictObject({ title, docIds });
export const conversationPatch = newConversation.partial().refine((body) => Object.keys(body).length > 0,
  "Supply a title or document IDs.");
export const newMessage = z.strictObject({ content: z.string().trim().min(1).max(16000) });
export const sources = z.array(z.object({
  chunk_id: id, doc_id: id, filename: z.string(), page: z.number().int().positive(),
  text: z.string(), score: z.number().finite()
})).max(4);
~~~~

## server/test/api.test.js

~~~~javascript
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
~~~~

## server/package-lock.json

~~~~json
{
  "name": "docchat-server",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "docchat-server",
      "version": "1.0.0",
      "dependencies": {
        "bcrypt": "6.0.0",
        "cors": "2.8.6",
        "eventsource-parser": "4.1.3",
        "express": "5.3.0",
        "express-rate-limit": "8.7.5",
        "helmet": "8.3.0",
        "jsonwebtoken": "9.0.3",
        "mongoose": "9.12.2",
        "multer": "2.5.0",
        "zod": "4.6.7"
      },
      "devDependencies": {
        "mongodb-memory-server-core": "11.3.0"
      },
      "engines": {
        "node": ">=22.17.0"
      }
    },
    "node_modules/@mongodb-js/saslprep": {
      "version": "1.6.3",
      "resolved": "https://registry.npmjs.org/@mongodb-js/saslprep/-/saslprep-1.6.3.tgz",
      "integrity": "sha512-aHGFvT95c82CoQ7hb6qXpz8Hcc5PJb3ZtQ+P01QDBbyQday0mjcrJPeNJOHCgWe0pGX0zKmKP+1mWi/I/BCX9Q==",
      "license": "MIT",
      "dependencies": {
        "sparse-bitfield": "^3.0.3"
      }
    },
    "node_modules/@standard-schema/spec": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
      "integrity": "sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==",
      "license": "MIT"
    },
    "node_modules/@types/webidl-conversions": {
      "version": "7.0.3",
      "resolved": "https://registry.npmjs.org/@types/webidl-conversions/-/webidl-conversions-7.0.3.tgz",
      "integrity": "sha512-CiJJvcRtIgzadHCYXw7dqEnMNRjhGZlYK05Mj9OyktqV8uVT8fD2BFOB7S1uwBE3Kj2Z+4UyPmFw/Ixgw/LAlA==",
      "license": "MIT"
    },
    "node_modules/@types/whatwg-url": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@types/whatwg-url/-/whatwg-url-13.0.0.tgz",
      "integrity": "sha512-N8WXpbE6Wgri7KUSvrmQcqrMllKZ9uxkYWMt+mCSGwNc0Hsw9VQTW7ApqI4XNrx6/SaM2QQJCzMPDEXE058s+Q==",
      "license": "MIT",
      "dependencies": {
        "@types/webidl-conversions": "*"
      }
    },
    "node_modules/accepts": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
      "integrity": "sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==",
      "license": "MIT",
      "dependencies": {
        "mime-types": "^3.0.0",
        "negotiator": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/agent-base": {
      "version": "7.1.4",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz",
      "integrity": "sha512-MnA+YT8fwfJPgBx3m60MNqakm30XOkyIoH1y6huTQvC0PwZG7ki8NacLBcrPbNoo8vEZy7Jpuk7+jMO+CUovTQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/append-field": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/append-field/-/append-field-1.0.0.tgz",
      "integrity": "sha512-klpgFSWLW1ZEs8svjfb7g4qWY0YS5imI82dTg+QahUvJ8YqAY0P10Uk8tTyh9ZGuYEZEMaeJYCF5BFuX552hsw==",
      "license": "MIT"
    },
    "node_modules/async-mutex": {
      "version": "0.5.0",
      "resolved": "https://registry.npmjs.org/async-mutex/-/async-mutex-0.5.0.tgz",
      "integrity": "sha512-1A94B18jkJ3DYq284ohPxoXbfTA5HsQ7/Mf4DEhcyLx3Bz27Rh59iScbB6EPiP+B+joue6YCxcMXSbFC1tZKwA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "tslib": "^2.4.0"
      }
    },
    "node_modules/b4a": {
      "version": "1.9.0",
      "resolved": "https://registry.npmjs.org/b4a/-/b4a-1.9.0.tgz",
      "integrity": "sha512-dpfcF9fDNR6++cthXR67iyhgqWy9CBouAvIWhIntzBG6cvK/cnIPiZQjBwi/ZqjjBEDGfoNDtmB0kTjroOJ3pQ==",
      "dev": true,
      "license": "Apache-2.0",
      "peerDependencies": {
        "react-native-b4a": "*"
      },
      "peerDependenciesMeta": {
        "react-native-b4a": {
          "optional": true
        }
      }
    },
    "node_modules/bare-buffer": {
      "version": "3.7.3",
      "resolved": "https://registry.npmjs.org/bare-buffer/-/bare-buffer-3.7.3.tgz",
      "integrity": "sha512-77owW16RX6YgdOzddHtM0oGz8wsd0/F9k/0coz6TPmjUHnr/9FwWODVMNKwyYWM/a/ESdTum855nfQxnsKUygA==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "bare": ">=1.20.0"
      }
    },
    "node_modules/bare-events": {
      "version": "2.9.2",
      "resolved": "https://registry.npmjs.org/bare-events/-/bare-events-2.9.2.tgz",
      "integrity": "sha512-AIPKioV7/Y/8KfZ3AAhjPJxLLbY49S64Ym5DakZlUg75qQiTgUq9hEJoEwa4eUezPUlXRy/i5NpsKvo9jgKmoA==",
      "dev": true,
      "license": "Apache-2.0",
      "peerDependencies": {
        "bare-abort-controller": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        }
      }
    },
    "node_modules/bare-fs": {
      "version": "4.8.4",
      "resolved": "https://registry.npmjs.org/bare-fs/-/bare-fs-4.8.4.tgz",
      "integrity": "sha512-MPC2eyrpbk3A873sK4y6rk+Iv4o2enxTjHZ8zH3HO0mjrpm5XjnguY2XmfidIsDV6vnjpbMBKUAJpV0ISD2SsQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.5.4",
        "bare-path": "^3.0.0",
        "bare-stream": "^2.6.4",
        "bare-url": "^2.2.2",
        "fast-fifo": "^1.3.2"
      },
      "engines": {
        "bare": ">=1.28.0"
      },
      "peerDependencies": {
        "bare-buffer": "*"
      },
      "peerDependenciesMeta": {
        "bare-buffer": {
          "optional": true
        }
      }
    },
    "node_modules/bare-path": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/bare-path/-/bare-path-3.1.3.tgz",
      "integrity": "sha512-8r+FVU/o4zcFmpCDqbqAYhHHbtXPP+cyZKo7DRGRWc7OLlNs4TMaSQEpXL/sIdzyEG0M7RHw4B7xYMGrTc+qrg==",
      "dev": true,
      "license": "Apache-2.0"
    },
    "node_modules/bare-stream": {
      "version": "2.13.4",
      "resolved": "https://registry.npmjs.org/bare-stream/-/bare-stream-2.13.4.tgz",
      "integrity": "sha512-PcrQ8lVLbiJscNm1Kez+Yp4Gy4AHGcN1lzwjvf5NybWen7VvEgUfyfnXYJ2zNqWnzOfCb1Abq6lH8ti0syQszA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.8.1",
        "streamx": "^2.25.0",
        "teex": "^1.0.1"
      },
      "peerDependencies": {
        "bare-abort-controller": "*",
        "bare-buffer": "*",
        "bare-events": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        },
        "bare-buffer": {
          "optional": true
        },
        "bare-events": {
          "optional": true
        }
      }
    },
    "node_modules/bare-url": {
      "version": "2.5.8",
      "resolved": "https://registry.npmjs.org/bare-url/-/bare-url-2.5.8.tgz",
      "integrity": "sha512-G5KTe5Bj6z5pqIxcn3lWlIFIv0rkXbccx0T0Xuf7t4RapfSWvFlcVbrwYXxFZ00PC4lp57OCIk6uXP/r3GbpDw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "bare-buffer": "^3.0.0",
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/bcrypt": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/bcrypt/-/bcrypt-6.0.0.tgz",
      "integrity": "sha512-cU8v/EGSrnH+HnxV2z0J7/blxH8gq7Xh2JFT6Aroax7UohdmiJJlxApMxtKfuI7z68NvvVcmR78k2LbT6efhRg==",
      "hasInstallScript": true,
      "license": "MIT",
      "dependencies": {
        "node-addon-api": "^8.3.0",
        "node-gyp-build": "^4.8.4"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/body-parser": {
      "version": "2.4.0",
      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz",
      "integrity": "sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==",
      "license": "MIT",
      "dependencies": {
        "bytes": "^3.1.2",
        "content-type": "^2.1.0",
        "debug": "^4.4.3",
        "http-errors": "^2.0.1",
        "iconv-lite": "^0.7.3",
        "on-finished": "^2.4.1",
        "qs": "^6.16.1",
        "raw-body": "^3.0.2",
        "type-is": "^2.1.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/bson": {
      "version": "7.3.4",
      "resolved": "https://registry.npmjs.org/bson/-/bson-7.3.4.tgz",
      "integrity": "sha512-eb33j2Ha6xgygjJ8bhI3sYaI9cLAbSaopZLRJQ5/rxk32XyBSoVVcbeHIzVGJx1SyQpyyoElkoEZgQrg+RVVoA==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=20.19.0"
      }
    },
    "node_modules/buffer-equal-constant-time": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/buffer-equal-constant-time/-/buffer-equal-constant-time-1.0.1.tgz",
      "integrity": "sha512-zRpUiDwd/xk6ADqPMATG8vc9VPrkck7T07OIx0gnjmJAnHnTVXNQG3vfvWNuiZIkwu9KrKdA1iJKfsfTVxE6NA==",
      "license": "BSD-3-Clause"
    },
    "node_modules/busboy": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/busboy/-/busboy-1.6.0.tgz",
      "integrity": "sha512-8SFQbg/0hQ9xy3UNTB0YEnsNBbWfhf7RtnzpL7TkBiTBRfrQ9Fxcnz7VJsleJpyp6rVLvXiuORqjlHi5q+PYuA==",
      "dependencies": {
        "streamsearch": "^1.1.0"
      },
      "engines": {
        "node": ">=10.16.0"
      }
    },
    "node_modules/bytes": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/call-bound": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "get-intrinsic": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/camelcase": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/camelcase/-/camelcase-6.3.0.tgz",
      "integrity": "sha512-Gmy6FhYlCY7uOElZUSbxo2UCDH8owEk996gkbrpsgGtrJLM3J7jGxl9Ic7Qwwj4ivOE5AWZWRMecDdF7hqGjFA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/commondir": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/commondir/-/commondir-1.0.1.tgz",
      "integrity": "sha512-W9pAhw0ja1Edb5GVdIF1mjZw/ASI0AlShXM83UUGe2DVr5TdAPEA1OA8m/g8zWp9x6On7gqufY+FatDbC3MDQg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/content-disposition": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-2.0.1.tgz",
      "integrity": "sha512-e+H0ZXHSWYrENhQzw1LPuP4oF5MzVKmDU6d3hxlvaPEYLLg62MxtQNPRx4SYSuYJSBUgnQIG4HIN2tEtNv7Dog==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/content-type": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz",
      "integrity": "sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/cookie": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie-signature": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
      "integrity": "sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==",
      "license": "MIT",
      "engines": {
        "node": ">=6.6.0"
      }
    },
    "node_modules/cors": {
      "version": "2.8.6",
      "resolved": "https://registry.npmjs.org/cors/-/cors-2.8.6.tgz",
      "integrity": "sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==",
      "license": "MIT",
      "dependencies": {
        "object-assign": "^4",
        "vary": "^1"
      },
      "engines": {
        "node": ">= 0.10"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/depd": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/ecdsa-sig-formatter": {
      "version": "1.0.11",
      "resolved": "https://registry.npmjs.org/ecdsa-sig-formatter/-/ecdsa-sig-formatter-1.0.11.tgz",
      "integrity": "sha512-nagl3RYrbNv6kQkeJIpt6NJZy8twLB/2vtz6yN9Z4vRKHN4/QZJIEbqohALSgwKdnksuY3k5Addp5lg8sVoVcQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/ee-first": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
      "license": "MIT"
    },
    "node_modules/encodeurl": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.3.tgz",
      "integrity": "sha512-mIteYONiEfc4xWf2F1WXovh1c8npzS00vNeiUPdwFF+QlVJni+gNvpQltLMQhob8rew/bWWc/bGTuUr0EUGt0w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz",
      "integrity": "sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escape-html": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
      "license": "MIT"
    },
    "node_modules/etag": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/events-universal": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/events-universal/-/events-universal-1.0.1.tgz",
      "integrity": "sha512-LUd5euvbMLpwOF8m6ivPCbhQeSiYVNb8Vs0fQ8QjXo0JTkEHpz8pxdQf0gStltaPpw0Cca8b39KxvK9cfKRiAw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.7.0"
      }
    },
    "node_modules/eventsource-parser": {
      "version": "4.1.3",
      "resolved": "https://registry.npmjs.org/eventsource-parser/-/eventsource-parser-4.1.3.tgz",
      "integrity": "sha512-jZVIVilXZfAx6H20ZKKEj5dabbpD9ETmMj3uHsjMmgBzBHB6tsHrmdWB4mAiy3amtN6MOoVkfXRQu4wf1n88Rw==",
      "license": "MIT",
      "engines": {
        "node": ">=22.12"
      }
    },
    "node_modules/express": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/express/-/express-5.3.0.tgz",
      "integrity": "sha512-qCqy1xSoaugxOD4IVHb1ZWdkvCF2W3aE2okKouWj8VwJ+ztskSiXoBnCSJqfKT+cVPJhuJqe9YLbY425+Zh00g==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.3.0",
        "content-disposition": "^2.0.1",
        "content-type": "^2.0.0",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.8",
        "qs": "^6.16.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.1.0",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/express-rate-limit": {
      "version": "8.7.5",
      "resolved": "https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.5.tgz",
      "integrity": "sha512-wi+v38cx2EqD0JnhE/e74o5tFqKWUOAPFJIgyEiqJ8v2MNpoOAA3kI2hXYOI+YM+HE5yqbdAlVxm2GqOIeYOgA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "ip-address": "^10.2.0"
      },
      "engines": {
        "node": ">= 16"
      },
      "funding": {
        "url": "https://github.com/sponsors/express-rate-limit"
      },
      "peerDependencies": {
        "express": ">= 4.11"
      }
    },
    "node_modules/fast-fifo": {
      "version": "1.3.2",
      "resolved": "https://registry.npmjs.org/fast-fifo/-/fast-fifo-1.3.2.tgz",
      "integrity": "sha512-/d9sfos4yxzpwkDkuN7k2SqFKtYNmCTzgfEpz82x34IM9/zc8KGxQoXg1liNC/izpRM/MBdt44Nmx41ZWqk+FQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/finalhandler": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
      "integrity": "sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "on-finished": "^2.4.1",
        "parseurl": "^1.3.3",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/find-cache-dir": {
      "version": "3.3.2",
      "resolved": "https://registry.npmjs.org/find-cache-dir/-/find-cache-dir-3.3.2.tgz",
      "integrity": "sha512-wXZV5emFEjrridIgED11OoUKLxiYjAcqot/NJdAkOhlJ+vGzwhOAfcG5OX1jP+S0PcjEn8bdMJv+g2jwQ3Onig==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "commondir": "^1.0.1",
        "make-dir": "^3.0.2",
        "pkg-dir": "^4.1.0"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/avajs/find-cache-dir?sponsor=1"
      }
    },
    "node_modules/find-up": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/find-up/-/find-up-4.1.0.tgz",
      "integrity": "sha512-PpOwAdQ/YlXQ2vj8a3h8IipDuYRi3wceVQQGYWxNINccq40Anw7BlsEXCMbt1Zt+OLA6Fq9suIpIWD0OsnISlw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "locate-path": "^5.0.0",
        "path-exists": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/follow-redirects": {
      "version": "1.16.3",
      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.3.tgz",
      "integrity": "sha512-toOSoqN6d51Wjf1aOFJYcoVv1aND9rj/CwjLU0Vz40oDuSpWDayCeKe4JpL5NL0WdFvoOOCI3BRo69HahjbR1A==",
      "dev": true,
      "funding": [
        {
          "type": "individual",
          "url": "https://github.com/sponsors/RubenVerborgh"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=4.0"
      },
      "peerDependenciesMeta": {
        "debug": {
          "optional": true
        }
      }
    },
    "node_modules/forwarded": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/fresh": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz",
      "integrity": "sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz",
      "integrity": "sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/helmet": {
      "version": "8.3.0",
      "resolved": "https://registry.npmjs.org/helmet/-/helmet-8.3.0.tgz",
      "integrity": "sha512-Qgpiaws3Sm30Av8Eah6sjMCZZwjlBu+E68rhpCWBshY1lb09HtLwj5GviX0OyQIn+ulUS0iX0AxN5n3tLZzz1w==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/EvanHahn"
      }
    },
    "node_modules/http-errors": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
      "license": "MIT",
      "dependencies": {
        "depd": "~2.0.0",
        "inherits": "~2.0.4",
        "setprototypeof": "~1.2.0",
        "statuses": "~2.0.2",
        "toidentifier": "~1.0.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/https-proxy-agent": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz",
      "integrity": "sha512-vK9P5/iUfdl95AI+JVyUuIcVtd4ofvtrOr3HNtM2yxC9bnMbEdp3x01OhQNnjb8IJYi38VlTE3mBXwcfvywuSw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.2",
        "debug": "4"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.7.3",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz",
      "integrity": "sha512-IKXpvIzjnC9XTAUbVBcMfGS0EPaIXtW6v+zr+RRp+hqULEpo0owZax6wyRwPOJbWbzjYspQwusTsfVr0ifh4uQ==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/ip-address": {
      "version": "10.7.6",
      "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.7.6.tgz",
      "integrity": "sha512-00LYkM6byILa9eQIx6qoaXCM40xTLd56AZ4vyaPW3YTyb49VZYPo5xsiAq4tuQ54GH4R7gVdYScJ1B7B77PuTg==",
      "license": "MIT",
      "engines": {
        "node": ">= 12"
      }
    },
    "node_modules/ipaddr.js": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/is-promise": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz",
      "integrity": "sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==",
      "license": "MIT"
    },
    "node_modules/jsonwebtoken": {
      "version": "9.0.3",
      "resolved": "https://registry.npmjs.org/jsonwebtoken/-/jsonwebtoken-9.0.3.tgz",
      "integrity": "sha512-MT/xP0CrubFRNLNKvxJ2BYfy53Zkm++5bX9dtuPbqAeQpTVe0MQTFhao8+Cp//EmJp244xt6Drw/GVEGCUj40g==",
      "license": "MIT",
      "dependencies": {
        "jws": "^4.0.1",
        "lodash.includes": "^4.3.0",
        "lodash.isboolean": "^3.0.3",
        "lodash.isinteger": "^4.0.4",
        "lodash.isnumber": "^3.0.3",
        "lodash.isplainobject": "^4.0.6",
        "lodash.isstring": "^4.0.1",
        "lodash.once": "^4.0.0",
        "ms": "^2.1.1",
        "semver": "^7.5.4"
      },
      "engines": {
        "node": ">=12",
        "npm": ">=6"
      }
    },
    "node_modules/jwa": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/jwa/-/jwa-2.0.1.tgz",
      "integrity": "sha512-hRF04fqJIP8Abbkq5NKGN0Bbr3JxlQ+qhZufXVr0DvujKy93ZCbXZMHDL4EOtodSbCWxOqR8MS1tXA5hwqCXDg==",
      "license": "MIT",
      "dependencies": {
        "buffer-equal-constant-time": "^1.0.1",
        "ecdsa-sig-formatter": "1.0.11",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/jws": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/jws/-/jws-4.0.1.tgz",
      "integrity": "sha512-EKI/M/yqPncGUUh44xz0PxSidXFr/+r0pA70+gIYhjv+et7yxM+s29Y+VGDkovRofQem0fs7Uvf4+YmAdyRduA==",
      "license": "MIT",
      "dependencies": {
        "jwa": "^2.0.1",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/kareem": {
      "version": "3.4.1",
      "resolved": "https://registry.npmjs.org/kareem/-/kareem-3.4.1.tgz",
      "integrity": "sha512-UlgCAFNAdk/HLSsbfkmbH8pJqpEN52Ek8RG53Ys1i3Q3gbCQruSrWpplZlgIGyDHX/LNoLW97ei3OG43s7UhUA==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/locate-path": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-5.0.0.tgz",
      "integrity": "sha512-t7hw9pI+WvuwNJXwk5zVHpyhIqzg2qTlklJOf0mVxGSbe3Fp2VieZcduNYjaLDoy6p9uGpQEGWG87WpMKlNq8g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-locate": "^4.1.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/lodash.includes": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/lodash.includes/-/lodash.includes-4.3.0.tgz",
      "integrity": "sha512-W3Bx6mdkRTGtlJISOvVD/lbqjTlPPUDTMnlXZFnVwi9NKJ6tiAk6LVdlhZMm17VZisqhKcgzpO5Wz91PCt5b0w==",
      "license": "MIT"
    },
    "node_modules/lodash.isboolean": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isboolean/-/lodash.isboolean-3.0.3.tgz",
      "integrity": "sha512-Bz5mupy2SVbPHURB98VAcw+aHh4vRV5IPNhILUCsOzRmsTmSQ17jIuqopAentWoehktxGd9e/hbIXq980/1QJg==",
      "license": "MIT"
    },
    "node_modules/lodash.isinteger": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/lodash.isinteger/-/lodash.isinteger-4.0.4.tgz",
      "integrity": "sha512-DBwtEWN2caHQ9/imiNeEA5ys1JoRtRfY3d7V9wkqtbycnAmTvRRmbHKDV4a0EYc678/dia0jrte4tjYwVBaZUA==",
      "license": "MIT"
    },
    "node_modules/lodash.isnumber": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isnumber/-/lodash.isnumber-3.0.3.tgz",
      "integrity": "sha512-QYqzpfwO3/CWf3XP+Z+tkQsfaLL/EnUlXWVkIk5FUPc4sBdTehEqZONuyRt2P67PXAk+NXmTBcc97zw9t1FQrw==",
      "license": "MIT"
    },
    "node_modules/lodash.isplainobject": {
      "version": "4.0.6",
      "resolved": "https://registry.npmjs.org/lodash.isplainobject/-/lodash.isplainobject-4.0.6.tgz",
      "integrity": "sha512-oSXzaWypCMHkPC3NvBEaPHf0KsA5mvPrOPgQWDsbg8n7orZ290M0BmC/jgRZ4vcJ6DTAhjrsSYgdsW/F+MFOBA==",
      "license": "MIT"
    },
    "node_modules/lodash.isstring": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/lodash.isstring/-/lodash.isstring-4.0.1.tgz",
      "integrity": "sha512-0wJxfxH1wgO3GrbuP+dTTk7op+6L41QCXbGINEmD+ny/G/eCqGzxyCsh7159S+mgDDcoarnBw6PC1PS5+wUGgw==",
      "license": "MIT"
    },
    "node_modules/lodash.once": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/lodash.once/-/lodash.once-4.1.1.tgz",
      "integrity": "sha512-Sb487aTOCr9drQVL8pIxOzVhafOjZN9UU54hiN8PU3uAiSV7lx1yYNpbNmex2PK6dSJoNTSJUUswT651yww3Mg==",
      "license": "MIT"
    },
    "node_modules/make-dir": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/make-dir/-/make-dir-3.1.0.tgz",
      "integrity": "sha512-g3FeP20LNwhALb/6Cz6Dd4F2ngze0jz7tbzrD2wAV+o9FeNHe4rL+yK2md0J/fiSf1sa1ADhXqi5+oVwOM/eGw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "semver": "^6.0.0"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/make-dir/node_modules/semver": {
      "version": "6.3.2",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.2.tgz",
      "integrity": "sha512-GYrCADwpu6yV5OAvchkQ27Z5wwMxWAEMg5NNWjyHh/5DboFFqbdbvYNIvZouQpxXyeMPoTOh0vdPYKlf0ZswdQ==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/media-typer": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-1.1.1.tgz",
      "integrity": "sha512-yz3xRaG20c6/BOzvYoDaGtPmGscs7YivItZEEqe6GbwNfHuxu9YNmvnEkMzKldAGY4/80pRcQRZSEnhquk9XuQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/memory-pager": {
      "version": "1.5.0",
      "resolved": "https://registry.npmjs.org/memory-pager/-/memory-pager-1.5.0.tgz",
      "integrity": "sha512-ZS4Bp4r/Zoeq6+NLJpP+0Zzm0pR8whtGPf1XExKLJBAczGMnSi3It14OiNCStjQjM6NU1okjQGSxgEZN8eBYKg==",
      "license": "MIT"
    },
    "node_modules/merge-descriptors": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz",
      "integrity": "sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/mime-db": {
      "version": "1.54.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz",
      "integrity": "sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz",
      "integrity": "sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "^1.54.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/mongodb": {
      "version": "7.5.0",
      "resolved": "https://registry.npmjs.org/mongodb/-/mongodb-7.5.0.tgz",
      "integrity": "sha512-5FnrEDLnvp6ycUOGLNLLU33BfCx2qmp2mJjGPDwKLruYsVzXVSK5fsGpoDXvsXJwBfBsD7ebMRdawbDxC2814g==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@mongodb-js/saslprep": "^1.4.11",
        "bson": "^7.2.0",
        "mongodb-connection-string-url": "^7.0.1"
      },
      "engines": {
        "node": ">=20.19.0"
      },
      "peerDependencies": {
        "@aws-sdk/credential-providers": "^3.806.0",
        "@mongodb-js/zstd": "^7.0.0",
        "gcp-metadata": "^7.0.1",
        "kerberos": "^7.0.0",
        "mongodb-client-encryption": "^7.2.0",
        "snappy": "^7.3.2",
        "socks": "^2.8.6"
      },
      "peerDependenciesMeta": {
        "@aws-sdk/credential-providers": {
          "optional": true
        },
        "@mongodb-js/zstd": {
          "optional": true
        },
        "gcp-metadata": {
          "optional": true
        },
        "kerberos": {
          "optional": true
        },
        "mongodb-client-encryption": {
          "optional": true
        },
        "snappy": {
          "optional": true
        },
        "socks": {
          "optional": true
        }
      }
    },
    "node_modules/mongodb-connection-string-url": {
      "version": "7.0.3",
      "resolved": "https://registry.npmjs.org/mongodb-connection-string-url/-/mongodb-connection-string-url-7.0.3.tgz",
      "integrity": "sha512-5I/pX3C2gPEz1EDdYMdZwBx1b/jE/f+J+KItSUJ02uQZ66bbe7kHKjv2uqCHJWaMCagem3dyfWqoAcv+XYZ6aw==",
      "license": "Apache-2.0",
      "dependencies": {
        "@types/whatwg-url": "^13.0.0",
        "whatwg-url": "^15.0.1"
      },
      "engines": {
        "node": ">=20.19.0"
      }
    },
    "node_modules/mongodb-memory-server-core": {
      "version": "11.3.0",
      "resolved": "https://registry.npmjs.org/mongodb-memory-server-core/-/mongodb-memory-server-core-11.3.0.tgz",
      "integrity": "sha512-QBu/RsRpBfcNd5CrBDfCzqcaFPaYpivUzGYUy9YgVc3up78ff0gIHQVD9PLmBLOOxFX6BM9hU6YT0HocZH+s1g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "async-mutex": "^0.5.0",
        "camelcase": "^6.3.0",
        "debug": "^4.4.3",
        "find-cache-dir": "^3.3.2",
        "follow-redirects": "^1.16.0",
        "https-proxy-agent": "^7.0.6",
        "mongodb": "~7.5.0",
        "new-find-package-json": "^2.0.0",
        "semver": "^7.8.5",
        "tar-stream": "^3.2.1",
        "tslib": "^2.8.1",
        "yauzl": "^3.4.0"
      },
      "engines": {
        "node": ">=20.19.0"
      }
    },
    "node_modules/mongoose": {
      "version": "9.12.2",
      "resolved": "https://registry.npmjs.org/mongoose/-/mongoose-9.12.2.tgz",
      "integrity": "sha512-SoWBAJGaC7UJ8SCmsVd34kDmiq/lvyeENVTHTjR1ez+vyfY/cu/K5/uCgIoXA6pYV5yMAHM72sWVe6XuYYEqeA==",
      "license": "MIT",
      "dependencies": {
        "@standard-schema/spec": "^1.1.0",
        "kareem": "3.4.1",
        "mongodb": "~7.8",
        "mpath": "0.9.0",
        "mquery": "6.0.1",
        "ms": "2.1.3",
        "sift": "17.1.4"
      },
      "engines": {
        "node": ">=20.19.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/mongoose"
      }
    },
    "node_modules/mongoose/node_modules/mongodb": {
      "version": "7.8.0",
      "resolved": "https://registry.npmjs.org/mongodb/-/mongodb-7.8.0.tgz",
      "integrity": "sha512-p2NKagbQ41+daACG/ZSvhTzeAo+DoEyWE9Cmpf/SyP3pTC43+X0mwKE/44PpKtCxp5wOxnXz+t2pXEZRSkt9Yg==",
      "license": "Apache-2.0",
      "dependencies": {
        "@mongodb-js/saslprep": "^1.5.0",
        "bson": "^7.3.2",
        "mongodb-connection-string-url": "^7.0.2"
      },
      "engines": {
        "node": ">=20.19.0"
      },
      "peerDependencies": {
        "@aws-sdk/credential-providers": "^3.806.0",
        "@mongodb-js/zstd": "^7.0.0",
        "gcp-metadata": "^7.0.1",
        "kerberos": "^7.0.0",
        "mongodb-client-encryption": "^7.2.0",
        "snappy": "^7.3.2",
        "socks": "^2.8.6"
      },
      "peerDependenciesMeta": {
        "@aws-sdk/credential-providers": {
          "optional": true
        },
        "@mongodb-js/zstd": {
          "optional": true
        },
        "gcp-metadata": {
          "optional": true
        },
        "kerberos": {
          "optional": true
        },
        "mongodb-client-encryption": {
          "optional": true
        },
        "snappy": {
          "optional": true
        },
        "socks": {
          "optional": true
        }
      }
    },
    "node_modules/mpath": {
      "version": "0.9.0",
      "resolved": "https://registry.npmjs.org/mpath/-/mpath-0.9.0.tgz",
      "integrity": "sha512-ikJRQTk8hw5DEoFVxHG1Gn9T/xcjtdnOKIU1JTmGjZZlg9LST2mBLmcX3/ICIbgJydT2GOc15RnNy5mHmzfSew==",
      "license": "MIT",
      "engines": {
        "node": ">=4.0.0"
      }
    },
    "node_modules/mquery": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/mquery/-/mquery-6.0.1.tgz",
      "integrity": "sha512-/Nijmq3JcpHwDM+5CwBp5yEl6fUa6jLsIhPsoQywlGXU/ZrKIvSpBzfaGnW9BLqcne/CoUwd1ch7MRqptDgFTA==",
      "license": "MIT",
      "engines": {
        "node": ">=20.19.0"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/multer": {
      "version": "2.5.0",
      "resolved": "https://registry.npmjs.org/multer/-/multer-2.5.0.tgz",
      "integrity": "sha512-BsqOzYGVq49JcW2IzoSAxeKYRevb+dGGPPWleOR8Lrlk4igwxu1/9pwSXlByhCb7MVZDrNJFC0IBP5/O5nLYRw==",
      "license": "MIT",
      "dependencies": {
        "append-field": "^1.0.0",
        "busboy": "^1.6.0",
        "type-is": "^1.6.18"
      },
      "engines": {
        "node": ">= 10.16.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/multer/node_modules/media-typer": {
      "version": "0.3.0",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz",
      "integrity": "sha512-dq+qelQ9akHpcOl/gUVRTxVIOkAJ1wR3QAvb4RsVjS8oVoFjDGTc679wJYmUmknUF5HwMLOgb5O+a3KxfWapPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/type-is": {
      "version": "1.6.18",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-1.6.18.tgz",
      "integrity": "sha512-TkRKr9sUTxEH8MdfuCSP7VizJyzRNMjj2J2do2Jr3Kym598JVdEksuzPQCnlFPW4ky9Q+iA+ma9BGm06XQBy8g==",
      "license": "MIT",
      "dependencies": {
        "media-typer": "0.3.0",
        "mime-types": "~2.1.24"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/negotiator": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-1.1.0.tgz",
      "integrity": "sha512-NMPBRMJgiQHjbd8phG3Vebdx4kZ1H121rbl5IkMqeOsahptB9BKo/d7oJ3zTXqTgagn2bWlNSXkh0QUGM31RYg==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^2.1.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/new-find-package-json": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/new-find-package-json/-/new-find-package-json-2.0.0.tgz",
      "integrity": "sha512-lDcBsjBSMlj3LXH2v/FW3txlh2pYTjmbOXPYJD93HI5EwuLzI11tdHSIpUMmfq/IOsldj4Ps8M8flhm+pCK4Ew==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "debug": "^4.3.4"
      },
      "engines": {
        "node": ">=12.22.0"
      }
    },
    "node_modules/node-addon-api": {
      "version": "8.9.2",
      "resolved": "https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.9.2.tgz",
      "integrity": "sha512-VijLXbi3UACN69I0JVXJsX4tjACjNoQDgv2gTF6sx2wWEi8tkSg2eX8p5gSIFi8z2+DL3oHmY6OyKce38SDolg==",
      "license": "MIT",
      "engines": {
        "node": "^18 || ^20 || >= 21"
      }
    },
    "node_modules/node-gyp-build": {
      "version": "4.8.4",
      "resolved": "https://registry.npmjs.org/node-gyp-build/-/node-gyp-build-4.8.4.tgz",
      "integrity": "sha512-LA4ZjwlnUblHVgq0oBF3Jl/6h/Nvs5fzBLwdEF4nuxnFdsfajde4WfxtJr3CaiH+F6ewcIB/q4jQ4UzPyid+CQ==",
      "license": "MIT",
      "bin": {
        "node-gyp-build": "bin.js",
        "node-gyp-build-optional": "optional.js",
        "node-gyp-build-test": "build-test.js"
      }
    },
    "node_modules/object-assign": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
      "integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/object-inspect": {
      "version": "1.14.0",
      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.14.0.tgz",
      "integrity": "sha512-IVgHNlp/jwQX271+Xzoq9LZNTWXxZK+cEOrGBOBxXNbn7fapnZ+Ts6TVMgNOuAezwG2wdtnMX97tTPK6VEnuOQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/on-finished": {
      "version": "2.4.2",
      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.2.tgz",
      "integrity": "sha512-ATWUv387i+nLD49EiDoOft5scf32Vsdz3ktrQJG9bi7jRFmaXTssvyvj1EmeKVVgvesbqUtvQQvaS2TpTukAZQ==",
      "license": "MIT",
      "dependencies": {
        "ee-first": "1.1.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/p-limit": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-2.3.0.tgz",
      "integrity": "sha512-//88mFWSJx8lxCzwdAABTJL2MyWB12+eIY7MDL2SqLmAkeKU9qxRvWuSyTjm3FUmpBEMuFfckAIqEaVGUDxb6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-try": "^2.0.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-locate": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-4.1.0.tgz",
      "integrity": "sha512-R79ZZ/0wAxKGu3oYMlz8jy/kbhsNrS7SKZ7PxEHBgJ5+F2mtFW2fK2cOtBh1cHYkQsbzFV7I+EoRKe6Yt0oK7A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-limit": "^2.2.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/p-try": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/p-try/-/p-try-2.2.0.tgz",
      "integrity": "sha512-R4nPAVTAU0B9D35/Gk3uJf/7XYbQcyohSKdvAxIRSNghFl4e71hVoGnBNQz9cWaXxO2I10KTC+3jMdvvoKw6dQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/parseurl": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/path-exists": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-to-regexp": {
      "version": "8.4.2",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz",
      "integrity": "sha512-qRcuIdP69NPm4qbACK+aDogI5CBDMi1jKe0ry5rSQJz8JVLsC7jV8XpiJjGRLLol3N+R5ihGYcrPLTno6pAdBA==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/pend": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/pend/-/pend-1.2.0.tgz",
      "integrity": "sha512-F3asv42UuXchdzt+xXqfW1OGlVBe+mxa2mqI0pg5yAHZPvFmY3Y6drSf/GQ1A86WgWEN9Kzh/WrgKa6iGcHXLg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/pkg-dir": {
      "version": "4.2.0",
      "resolved": "https://registry.npmjs.org/pkg-dir/-/pkg-dir-4.2.0.tgz",
      "integrity": "sha512-HRDzbaKjC+AOWVXxAU/x54COGeIv9eb+6CkDSQoNTt4XyWoIJvuPsXizxu/Fr23EiekbtZwmh1IcIG/l/a10GQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "find-up": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/proxy-addr": {
      "version": "2.0.8",
      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz",
      "integrity": "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
      "license": "MIT",
      "dependencies": {
        "forwarded": "0.2.0",
        "ipaddr.js": "1.9.1"
      },
      "engines": {
        "node": ">= 0.10"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/punycode": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/qs": {
      "version": "6.17.1",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.17.1.tgz",
      "integrity": "sha512-jd3COkaKVgGUW+ZHyEHCG9bH7RoaaiWuMgzsIBjUMVjLAaWGWpoUAVwljVvBHxRu/2qEHnadLGZrkutYUBPQJA==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "es-define-property": "^1.0.1",
        "side-channel": "^1.1.1"
      },
      "engines": {
        "node": ">=0.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/range-parser": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.3.0.tgz",
      "integrity": "sha512-hek2mFQpPuI4E1BBKrSto+BU3e3x4xuarsbiwr3+lf7p44juvFMV0XFWQAP3xUyqXA4RrXLIoaSUGbSt056ZMw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/raw-body": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz",
      "integrity": "sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "~3.1.2",
        "http-errors": "~2.0.1",
        "iconv-lite": "~0.7.0",
        "unpipe": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/router": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/router/-/router-2.3.0.tgz",
      "integrity": "sha512-bpowRfGjEPe8t9R6fJIzhwmyCGAXwKvxBUsgJm+bJukwdcWmUXbMo7p22w7aYmQBPQTUMNqMV39YX0kMou3z8w==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "is-promise": "^4.0.0",
        "parseurl": "^1.3.3",
        "path-to-regexp": "^8.0.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/safe-buffer": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "7.8.6",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.6.tgz",
      "integrity": "sha512-9lpSSU4Mly3mrtruwLs1eLK6+gzbzqeBFwRNjIjE+9LuDpWdYctrQlQ3ej1Ilgi7gknpsTRnPoLP8DpCHqHIJw==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/send": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/send/-/send-1.2.1.tgz",
      "integrity": "sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.1",
        "mime-types": "^3.0.2",
        "ms": "^2.1.3",
        "on-finished": "^2.4.1",
        "range-parser": "^1.2.1",
        "statuses": "^2.0.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/serve-static": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz",
      "integrity": "sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==",
      "license": "MIT",
      "dependencies": {
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "parseurl": "^1.3.3",
        "send": "^1.2.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/setprototypeof": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
      "license": "ISC"
    },
    "node_modules/side-channel": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz",
      "integrity": "sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.4",
        "side-channel-list": "^1.0.1",
        "side-channel-map": "^1.0.1",
        "side-channel-weakmap": "^1.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-list": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz",
      "integrity": "sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.4"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-map": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-weakmap": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3",
        "side-channel-map": "^1.0.1"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/sift": {
      "version": "17.1.4",
      "resolved": "https://registry.npmjs.org/sift/-/sift-17.1.4.tgz",
      "integrity": "sha512-/OIVvj9Ts1mFwTYzW09YODMPeIOnDoigMOvKSIN44OmaCyhuCH/05UPF45XW7Ax0snmzDzCzdlSYqvqsn8+sIg==",
      "license": "MIT"
    },
    "node_modules/sparse-bitfield": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/sparse-bitfield/-/sparse-bitfield-3.0.3.tgz",
      "integrity": "sha512-kvzhi7vqKTfkh0PZU+2D2PIllw2ymqJKujUcyPMd9Y75Nv4nPbGJZXNhxsgdQab2BmlDct1YnfQCguEvHr7VsQ==",
      "license": "MIT",
      "dependencies": {
        "memory-pager": "^1.0.2"
      }
    },
    "node_modules/statuses": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/streamsearch": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/streamsearch/-/streamsearch-1.1.0.tgz",
      "integrity": "sha512-Mcc5wHehp9aXz1ax6bZUyY5afg9u2rv5cqQI3mRrYkGC8rW2hM02jWuwjtL++LS5qinSyhj2QfLyNsuc+VsExg==",
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/streamx": {
      "version": "2.28.1",
      "resolved": "https://registry.npmjs.org/streamx/-/streamx-2.28.1.tgz",
      "integrity": "sha512-zEzXb0s5Cds7tqMH6rhZ05lcJydCWiQPEwiNngVqzsxCc962vLY4Uw+mW7od8kDH258k2Uz/JrOkdIAAhSh9VA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "events-universal": "^1.0.0",
        "fast-fifo": "^1.3.2",
        "text-decoder": "^1.1.0"
      }
    },
    "node_modules/tar-stream": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/tar-stream/-/tar-stream-3.2.2.tgz",
      "integrity": "sha512-+8NeqHRjQWH9nYlwo2gamAMImZCVzI4UoEgDpWorBt9OEfppiZn+uSkskzQKPWIZyji/C8fpWO7u69G0DX0tbg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "b4a": "^1.9.0",
        "bare-fs": "^4.8.2",
        "fast-fifo": "^1.3.2",
        "streamx": "^2.28.1"
      }
    },
    "node_modules/teex": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/teex/-/teex-1.0.1.tgz",
      "integrity": "sha512-eYE6iEI62Ni1H8oIa7KlDU6uQBtqr4Eajni3wX7rpfXD8ysFx8z0+dri+KWEPWpBsxXfxu58x/0jvTVT1ekOSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "streamx": "^2.12.5"
      }
    },
    "node_modules/text-decoder": {
      "version": "1.2.7",
      "resolved": "https://registry.npmjs.org/text-decoder/-/text-decoder-1.2.7.tgz",
      "integrity": "sha512-vlLytXkeP4xvEq2otHeJfSQIRyWxo/oZGEbXrtEEF9Hnmrdly59sUbzZ/QgyWuLYHctCHxFF4tRQZNQ9k60ExQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.6.4"
      }
    },
    "node_modules/toidentifier": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.6"
      }
    },
    "node_modules/tr46": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/tr46/-/tr46-6.0.0.tgz",
      "integrity": "sha512-bLVMLPtstlZ4iMQHpFHTR7GAGj2jxi8Dg0s2h2MafAE4uSWF98FC/3MomU51iQAMf8/qDUbKWf5GxuvvVcXEhw==",
      "license": "MIT",
      "dependencies": {
        "punycode": "^2.3.1"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/tslib": {
      "version": "2.9.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.9.1.tgz",
      "integrity": "sha512-a4Ux9VKuIMHsOS7ENbEq6hK2ZGYIT27Rtl0E4eD9KqwxhKiQeMZE/9xb3IdYwWaSOyIBQLExhQgXDTYoiCxnWA==",
      "dev": true,
      "license": "0BSD"
    },
    "node_modules/type-is": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-2.1.0.tgz",
      "integrity": "sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^2.0.0",
        "media-typer": "^1.1.0",
        "mime-types": "^3.0.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/unpipe": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/vary": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/webidl-conversions": {
      "version": "8.0.1",
      "resolved": "https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-8.0.1.tgz",
      "integrity": "sha512-BMhLD/Sw+GbJC21C/UgyaZX41nPt8bUTg+jWyDeg7e7YN4xOM05YPSIXceACnXVtqyEw/LMClUQMtMZ+PGGpqQ==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/whatwg-url": {
      "version": "15.1.0",
      "resolved": "https://registry.npmjs.org/whatwg-url/-/whatwg-url-15.1.0.tgz",
      "integrity": "sha512-2ytDk0kiEj/yu90JOAp44PVPUkO9+jVhyf+SybKlRHSDlvOOZhdPIrr7xTH64l4WixO2cP+wQIcgujkGBPPz6g==",
      "license": "MIT",
      "dependencies": {
        "tr46": "^6.0.0",
        "webidl-conversions": "^8.0.0"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    },
    "node_modules/yauzl": {
      "version": "3.4.0",
      "resolved": "https://registry.npmjs.org/yauzl/-/yauzl-3.4.0.tgz",
      "integrity": "sha512-jIH9yLR9wqr0wOS0TpBvo/g/2UgZH5qePVbjgRliiF0BYvOZyaBknKsF+x9Iht0O6sqgnB93rCICdOZFecJuDw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "pend": "~1.2.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/zod": {
      "version": "4.6.7",
      "resolved": "https://registry.npmjs.org/zod/-/zod-4.6.7.tgz",
      "integrity": "sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/colinhacks"
      }
    }
  }
}
~~~~

## server/README.md

~~~~markdown
# DocChat Express API

## Integration assumptions

- Express and FastAPI share `MONGODB_URI`, `MONGODB_DB` and `INTERNAL_KEY`. Use an Atlas deployment that supports transactions. Express uses transactions for quota reservations, message writes and cascading deletion. [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- Registration accepts a password of at least eight characters and at most 72 UTF-8 bytes. Registration and login return `{ token, user }`. The token expires after 15 minutes. `/api/auth/me`, uploads, and conversation creates and updates return the resource directly. Lists return arrays and deletes return HTTP 204. Resource IDs use `_id`.
- The 10-document and 200 MiB quotas include processing, ready and failed uploads. A file may be exactly 50 MiB. FastAPI checks the 500-page limit during background ingestion. Poll the document after HTTP 202. Delete a failed upload to reclaim its quota.
- Conversations accept an empty document selection. Chat requires at least one ready document owned by the caller. One answer streams per conversation at a time. History contains the four messages immediately preceding the new question, in chronological order.
- A submitted question stays in history when generation fails or the client disconnects. Express commits the assistant message before forwarding a successful `done`. FastAPI's `done.ok: false` passes through unchanged. A truncated upstream stream closes the HTTP response without a successful terminal event.
- Errors before streaming use `{ "error": { "code": "CODE", "message": "Message" } }`. Rate limits use a 15-minute window per server process. The general limit is 300 requests per IP, login allows 10 per IP, upload allows 20 per user, and chat allows 30 per user. `TRUST_PROXY_HOPS` defaults to 0 for direct connections.

## Install and run

Use Node.js 22.17 or later. From the project root in PowerShell, install the locked dependencies and create the local environment file.

```powershell
Set-Location server
npm.cmd ci
if (!(Test-Path .env)) {
    $jwt = node -p "require('node:crypto').randomBytes(32).toString('hex')"
    (Get-Content .env.example) -replace '^JWT_SECRET=$', "JWT_SECRET=$jwt" | Set-Content -Encoding ascii .env
}
```

Set `MONGODB_URI` and `INTERNAL_KEY` in `.env`. Match `MONGODB_DB` to FastAPI, `AI_URL` to its address, and `CLIENT_URL` to the React origin. Start FastAPI using `../ai-service/README.md`. From `server`, start Express.

```powershell
npm.cmd start
```

## Automated tests

```powershell
npm.cmd test
```

The tests launch an isolated MongoDB replica set and a local HTTP fixture for FastAPI. The first run downloads a MongoDB test binary. The suite exercises ownership, exact size boundaries, concurrent quota reservations, streaming, history, cancellation, and cleanup.

## Curl examples for every route

Open a second PowerShell in `server`. These commands create a disposable account and a valid one-page PDF, then remove the demonstration documents and conversation. The PDF generation command uses the existing FastAPI virtual environment.

```powershell
$base = 'http://127.0.0.1:4000'
$email = "demo-$([guid]::NewGuid())@example.org"
$password = node -p "require('node:crypto').randomBytes(24).toString('hex')"
$credentials = @{ email = $email; password = $password } | ConvertTo-Json -Compress

# GET /health
curl.exe -fsS "$base/health"

# POST /api/auth/register
$credentials | curl.exe -fsS -H 'Content-Type: application/json' --data-binary '@-' "$base/api/auth/register" | Out-Null

# POST /api/auth/login
$session = $credentials | curl.exe -fsS -H 'Content-Type: application/json' --data-binary '@-' "$base/api/auth/login" | ConvertFrom-Json
$auth = "Authorization: Bearer $($session.token)"

# GET /api/auth/me
curl.exe -fsS -H $auth "$base/api/auth/me"

# POST /api/documents
$pdf = Join-Path $env:TEMP "docchat-demo-$([guid]::NewGuid()).pdf"
& ..\ai-service\.venv\Scripts\python.exe -c "import pymupdf,sys; d=pymupdf.open(); d.new_page().insert_text((72,72),'Refund payments are due within thirty days of purchase.'); d.save(sys.argv[1]); d.close()" $pdf
$doc = curl.exe -fsS -H $auth -F "file=@$pdf;filename=returns.pdf;type=application/pdf" "$base/api/documents" | ConvertFrom-Json
$docUrl = "$base/api/documents/$($doc._id)"

# GET /api/documents
curl.exe -fsS -H $auth "$base/api/documents"

# GET /api/documents/:id
$deadline = (Get-Date).AddMinutes(5)
do {
    $doc = curl.exe -fsS -H $auth "$docUrl" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Document lookup failed.' }
    if ($doc.status -eq 'failed') { throw $doc.error }
    if ($doc.status -eq 'ready') { break }
    if ((Get-Date) -ge $deadline) { throw 'Document is still processing.' }
    Start-Sleep -Seconds 1
} while ($true)

# POST /api/conversations
$new = @{ title = 'Refund policy'; docIds = @($doc._id) } | ConvertTo-Json -Compress
$chat = $new | curl.exe -fsS -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$base/api/conversations" | ConvertFrom-Json
$chatUrl = "$base/api/conversations/$($chat._id)"

# GET /api/conversations
curl.exe -fsS -H $auth "$base/api/conversations"

# PATCH /api/conversations/:id
'{"title":"Returns"}' | curl.exe -fsS -X PATCH -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$chatUrl"

# POST /api/conversations/:id/messages
'{"content":"When are refund payments due?"}' | curl.exe -fsS -N -H $auth -H 'Content-Type: application/json' --data-binary '@-' "$chatUrl/messages"

# GET /api/conversations/:id/messages
curl.exe -fsS -H $auth "$chatUrl/messages"

# DELETE /api/conversations/:id
curl.exe -fsS -i -X DELETE -H $auth "$chatUrl"

# DELETE /api/documents/:id
curl.exe -fsS -i -X DELETE -H $auth "$docUrl"
```

Once Atlas has indexed the sample, the answer should cite `[returns.pdf, p.1]`. The message history should contain the same answer and the sources received over SSE.

## Checklist

- [x] Four Mongoose models and all requested HTTP routes
- [x] bcrypt, expiring bearer tokens, validation, and owner-scoped access
- [x] Disk uploads, PDF signature checks, atomic quotas, forwarding, and cleanup
- [x] Ready-document selection, four-message history, byte-preserving SSE, and disconnect cancellation
- [x] Helmet, restricted CORS, route-specific rate limits, and consistent JSON errors
- [x] Environment template, locked dependencies, integration tests, and curl examples
~~~~
