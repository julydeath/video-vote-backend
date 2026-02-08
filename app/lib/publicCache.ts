import { getRedisClient } from "@/app/lib/redis";

const globalForPublicCache = global as unknown as {
  __publicCache?: Map<string, { value: unknown; expiresAt: number }>;
  __publicRate?: Map<string, { count: number; resetAt: number }>;
  __publicMetrics?: {
    hits: number;
    misses: number;
    sets: number;
    rateLimited: number;
    lockDenied: number;
  };
};

const cache =
  globalForPublicCache.__publicCache ||
  new Map<string, { value: unknown; expiresAt: number }>();

globalForPublicCache.__publicCache = cache;

const rate =
  globalForPublicCache.__publicRate ||
  new Map<string, { count: number; resetAt: number }>();

globalForPublicCache.__publicRate = rate;

const metrics =
  globalForPublicCache.__publicMetrics || {
    hits: 0,
    misses: 0,
    sets: 0,
    rateLimited: 0,
    lockDenied: 0,
  };

globalForPublicCache.__publicMetrics = metrics;

export function getCacheMetrics() {
  return { ...metrics };
}

export function resetCacheMetrics() {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.sets = 0;
  metrics.rateLimited = 0;
  metrics.lockDenied = 0;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (redis) {
    const value = await redis.get(key);
    if (!value) {
      metrics.misses += 1;
      return null;
    }
    metrics.hits += 1;
    return JSON.parse(value) as T;
  }

  const entry = cache.get(key);
  if (!entry) {
    metrics.misses += 1;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    metrics.misses += 1;
    return null;
  }
  metrics.hits += 1;
  return entry.value as T;
}

export async function setCached<T>(key: string, value: T, ttlMs: number) {
  const redis = await getRedisClient();
  if (redis) {
    await redis.setEx(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
    metrics.sets += 1;
    return;
  }

  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  metrics.sets += 1;
}

function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}

export async function checkRateLimit(
  headers: Headers,
  options?: {
    max?: number;
    windowMs?: number;
    keyPrefix?: string;
    keySuffix?: string;
    keyOverride?: string;
  },
) {
  const max = options?.max ?? 120;
  const windowMs = options?.windowMs ?? 60_000;
  const keyPrefix = options?.keyPrefix ?? "public";
  const ip = getClientIp(headers);
  const key =
    options?.keyOverride ||
    `${keyPrefix}:${ip}${options?.keySuffix ? `:${options.keySuffix}` : ""}`;
  const now = Date.now();

  const redis = await getRedisClient();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pExpire(key, windowMs);
    }
    const ttl = await redis.pTTL(key);
    if (count > max) {
      metrics.rateLimited += 1;
      const retryAfter = Math.max(0, Math.ceil(ttl / 1000));
      return { ok: false as const, retryAfter };
    }
    return { ok: true as const, retryAfter: 0 };
  }

  const entry = rate.get(key);
  if (!entry || now > entry.resetAt) {
    rate.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, retryAfter: 0 };
  }

  if (entry.count >= max) {
    metrics.rateLimited += 1;
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false as const, retryAfter };
  }

  entry.count += 1;
  rate.set(key, entry);
  return { ok: true as const, retryAfter: 0 };
}

export async function acquireLock(key: string, ttlMs = 5000) {
  const redis = await getRedisClient();
  if (redis) {
    const ok = await redis.set(key, "1", { NX: true, PX: ttlMs });
    if (ok !== "OK") metrics.lockDenied += 1;
    return ok === "OK";
  }
  return false;
}

export async function releaseLock(key: string) {
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(key);
  }
}
