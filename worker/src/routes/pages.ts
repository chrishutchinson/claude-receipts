import { Hono } from "hono";
import type { Env } from "../types.js";
import { generate404Html } from "../lib/html.js";

export const pageRoutes = new Hono<{ Bindings: Env }>();

// Serve receipt HTML from R2
pageRoutes.get("/r/:id", async (c) => {
  const id = c.req.param("id");

  // Validate ID format (nanoid is alphanumeric with - and _)
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) {
    return c.html(generate404Html(), 404);
  }

  // Get HTML from R2
  const object = await c.env.RECEIPTS.get(`${id}.html`);

  if (!object) {
    return c.html(generate404Html(), 404);
  }

  // Return the stored HTML
  const html = await object.text();

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=31536000, immutable",
  });
});

// Root redirect to GitHub
pageRoutes.get("/", (c) => {
  return c.redirect("https://github.com/chrishutchinson/claude-receipts");
});
