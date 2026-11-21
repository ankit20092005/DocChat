import { loadEnvFile } from "node:process";
import { z } from "zod";

try {
  loadEnvFile(new URL("../../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const httpUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
});

const result = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: httpUrl.transform((value) => new URL(value).origin),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/.+/),
  MONGODB_DB: z.string().min(1).default("docchat"),
  JWT_SECRET: z.string().min(32),
  AI_URL: httpUrl.transform((value) => value.replace(/\/+$/, "")),
  INTERNAL_KEY: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(600000).default(120000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0)
}).safeParse(process.env);

if (!result.success) {
  const names = result.error.issues.map((issue) => issue.path.join("."));
  throw new Error("Invalid server configuration for " + names.join(", "));
}

export const env = Object.freeze(result.data);
export const maxFileBytes = 50 * 1024 * 1024;
export const maxUserBytes = 200 * 1024 * 1024;
export const maxDocuments = 10;
