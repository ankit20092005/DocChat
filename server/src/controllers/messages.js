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
