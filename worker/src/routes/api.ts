import { Hono } from "hono";
import { nanoid } from "nanoid";
import type { Env, ShareableReceiptData } from "../types.js";
import { validateReceiptData } from "../lib/validation.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { generatePublicReceiptHtml } from "../lib/html.js";

export const apiRoutes = new Hono<{ Bindings: Env }>();

// Create a new shared receipt
apiRoutes.post("/receipts", async (c) => {
  // Get client IP for rate limiting
  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "unknown";

  // Check rate limit
  const rateLimitResult = await checkRateLimit(c.env.RATE_LIMITS, ip);

  // Set rate limit headers
  c.header("X-RateLimit-Limit", "10");
  c.header("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
  c.header("X-RateLimit-Reset", rateLimitResult.resetAt.toISOString());

  if (!rateLimitResult.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        message:
          "You can share up to 10 receipts per hour. Please try again later.",
        resetAt: rateLimitResult.resetAt.toISOString(),
      },
      429,
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const validation = validateReceiptData(body);
  if (!validation.valid) {
    return c.json(
      {
        error: "Validation failed",
        details: validation.errors,
      },
      400,
    );
  }

  const data = validation.data!;

  // Generate a unique ID
  const id = nanoid(12);

  // Get base URL for the public link
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const publicUrl = `${baseUrl}/r/${id}`;

  // Generate HTML
  const html = generatePublicReceiptHtml(data, id, baseUrl);

  // Store in R2
  try {
    await c.env.RECEIPTS.put(`${id}.html`, html, {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        sessionSlug: data.sessionSlug,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("R2 error:", error);
    return c.json({ error: "Failed to store receipt" }, 500);
  }

  return c.json(
    {
      id,
      url: publicUrl,
    },
    201,
  );
});

// Get receipt metadata as JSON (optional endpoint)
apiRoutes.get("/receipts/:id", async (c) => {
  const id = c.req.param("id");

  // Validate ID format (nanoid is alphanumeric with - and _)
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return c.json({ error: "Invalid receipt ID" }, 400);
  }

  // Check if receipt exists in R2
  const object = await c.env.RECEIPTS.head(`${id}.html`);

  if (!object) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  return c.json({
    id,
    url: `${new URL(c.req.url).origin}/r/${id}`,
    sessionSlug: object.customMetadata?.sessionSlug,
    createdAt: object.customMetadata?.createdAt,
  });
});
