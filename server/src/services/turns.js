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
