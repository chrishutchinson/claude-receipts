const RATE_LIMIT = 10; // requests per hour
const WINDOW_SECONDS = 60 * 60; // 1 hour

/**
 * Hash an IP address for privacy (we don't store raw IPs)
 */
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "-claude-receipts-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface RateLimitEntry {
  count: number;
  windowStart: number; // Unix timestamp
}

/**
 * Check and update rate limit for an IP address using KV
 */
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<RateLimitResult> {
  const ipHash = await hashIP(ip);
  const key = `ratelimit:${ipHash}`;
  const now = Date.now();

  // Get current rate limit entry
  const existing = await kv.get<RateLimitEntry>(key, "json");

  if (!existing) {
    // First request - create new entry
    const entry: RateLimitEntry = {
      count: 1,
      windowStart: now,
    };
    await kv.put(key, JSON.stringify(entry), { expirationTtl: WINDOW_SECONDS });

    return {
      allowed: true,
      remaining: RATE_LIMIT - 1,
      resetAt: new Date(now + WINDOW_SECONDS * 1000),
    };
  }

  const windowEnd = existing.windowStart + WINDOW_SECONDS * 1000;

  // Check if window has expired
  if (now > windowEnd) {
    // Reset the window
    const entry: RateLimitEntry = {
      count: 1,
      windowStart: now,
    };
    await kv.put(key, JSON.stringify(entry), { expirationTtl: WINDOW_SECONDS });

    return {
      allowed: true,
      remaining: RATE_LIMIT - 1,
      resetAt: new Date(now + WINDOW_SECONDS * 1000),
    };
  }

  // Window still active
  if (existing.count >= RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(windowEnd),
    };
  }

  // Increment counter
  const entry: RateLimitEntry = {
    count: existing.count + 1,
    windowStart: existing.windowStart,
  };
  const ttl = Math.ceil((windowEnd - now) / 1000);
  await kv.put(key, JSON.stringify(entry), {
    expirationTtl: ttl > 0 ? ttl : 1,
  });

  return {
    allowed: true,
    remaining: RATE_LIMIT - entry.count,
    resetAt: new Date(windowEnd),
  };
}
