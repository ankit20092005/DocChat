import { once } from "node:events";
import { rmdir } from "node:fs/promises";
import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { uploadDir } from "./middleware/upload.js";
import { User, Document, Conversation, Message } from "./models/index.js";

try {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB, serverSelectionTimeoutMS: 8000 });
  await Promise.all([User, Document, Conversation, Message].map((model) => model.init()));
  const server = app.listen(env.PORT);
  await once(server, "listening");
  console.info("DocChat server listening on port", env.PORT);
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
} catch (error) {
  console.error("Server stopped", error.name);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await rmdir(uploadDir).catch((error) => console.error("Upload directory cleanup failed", error.code));
}
