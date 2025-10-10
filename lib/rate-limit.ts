type RateLimitRecord = {
  count: number;
  windowStart: number;
};

const store = new Map<string, RateLimitRecord>();

export type RateLimitOptions = {
  windowMs?: number; // sliding window in ms
  max?: number; // max requests per window
};

export function checkRateLimit(key: string, opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000; // default 1 minute
  const max = opts.max ?? 6; // default 6 requests per window

  const now = Date.now();
  const rec = store.get(key);

  if (!rec || now - rec.windowStart >= windowMs) {
    // reset window
    store.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: max - 1, reset: now + windowMs };
  }

  // within window
  rec.count += 1;
  store.set(key, rec);

  if (rec.count > max) {
    return { ok: false, remaining: 0, reset: rec.windowStart + windowMs };
  }

  return {
    ok: true,
    remaining: max - rec.count,
    reset: rec.windowStart + windowMs,
  };
}

// helper to reset a key (useful for tests)
export function resetRateLimit(key: string) {
  store.delete(key);
}

// helper to clear all (for tests/dev)
export function clearAllRateLimits() {
  store.clear();
}
