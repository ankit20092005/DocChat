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
