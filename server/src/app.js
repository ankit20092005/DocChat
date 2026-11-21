import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { handleError } from "./middleware/errors.js";
import { generalLimit } from "./middleware/security.js";
import { api } from "./routes/index.js";
import { ApiError, missing } from "./utils/errors.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.CLIENT_URL) return callback(null, true);
    callback(new ApiError(403, "ORIGIN_DENIED", "This origin is not allowed."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
}));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", generalLimit, express.json({ limit: "128kb" }), api);
app.use((req, res, next) => next(missing("Route")));
app.use(handleError);
