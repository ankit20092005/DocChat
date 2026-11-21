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
