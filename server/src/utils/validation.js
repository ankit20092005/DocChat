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
