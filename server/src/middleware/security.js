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
