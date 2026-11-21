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
