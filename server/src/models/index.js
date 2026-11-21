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
