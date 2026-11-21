import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import multer from "multer";
import { maxFileBytes } from "../config/env.js";
import { ApiError, tooLarge } from "../utils/errors.js";

export const uploadDir = mkdtempSync(join(tmpdir(), "docchat-uploads-"));
const receiveFile = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => callback(null, randomUUID() + ".pdf")
  }),
  defParamCharset: "utf8",
  // Busboy signals its limit at equality. Allow exactly 50 MiB.
  limits: { fileSize: maxFileBytes + 1, files: 1, fields: 0, parts: 2 }
}).single("file");

export function upload(req, res, next) {
  receiveFile(req, res, (error) => {
    if (error && !(error instanceof multer.MulterError) && !error.code) {
      return next(new ApiError(400, "INVALID_UPLOAD", "The multipart upload could not be read."));
    }
    next(error);
  });
}

export async function verifyPdf(file) {
  if (!file) throw new ApiError(400, "FILE_REQUIRED", "Send a PDF in the file field.");
  if (file.size > maxFileBytes) throw tooLarge();
  const handle = await open(file.path, "r");
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (!header.equals(Buffer.from("%PDF-"))) {
      throw new ApiError(415, "INVALID_PDF", "The uploaded file must be a PDF.");
    }
  } finally {
    await handle.close();
  }
  const name = posix.basename(file.originalname.replaceAll("\\", "/")).normalize("NFC");
  const stem = name.replace(/\.pdf$/i, "").replace(/[\p{C}<>:"|?*\[\]]/gu, "_").trim();
  return (Array.from(stem).slice(0, 150).join("") || "document") + ".pdf";
}
