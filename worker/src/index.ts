import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";
import { apiRoutes } from "./routes/api.js";
import { pageRoutes } from "./routes/pages.js";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Mount API routes
app.route("/api", apiRoutes);

// Mount page routes
app.route("/", pageRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
