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
