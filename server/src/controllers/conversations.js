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
