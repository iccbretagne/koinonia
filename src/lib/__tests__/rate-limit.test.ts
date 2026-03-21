import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result = rateLimit(key, { max: 5, windowMs: 60_000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count correctly", () => {
    const key = `test-count-${Date.now()}`;
    const opts = { max: 3, windowMs: 60_000 };

    expect(rateLimit(key, opts).remaining).toBe(2);
    expect(rateLimit(key, opts).remaining).toBe(1);
    expect(rateLimit(key, opts).remaining).toBe(0);
  });

  it("blocks after exceeding the limit", () => {
    const key = `test-block-${Date.now()}`;
    const opts = { max: 2, windowMs: 60_000 };

    expect(rateLimit(key, opts).success).toBe(true);
    expect(rateLimit(key, opts).success).toBe(true);
    expect(rateLimit(key, opts).success).toBe(false);
    expect(rateLimit(key, opts).remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const key = `test-reset-${Date.now()}`;
    const opts = { max: 1, windowMs: 1 };

    expect(rateLimit(key, opts).success).toBe(true);

    // Wait just enough for the window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy-wait a few ms
    }

    expect(rateLimit(key, opts).success).toBe(true);
  });

  it("isolates different keys", () => {
    const key1 = `test-isolate-a-${Date.now()}`;
    const key2 = `test-isolate-b-${Date.now()}`;
    const opts = { max: 1, windowMs: 60_000 };

    expect(rateLimit(key1, opts).success).toBe(true);
    expect(rateLimit(key1, opts).success).toBe(false);

    // Different key should still be allowed
    expect(rateLimit(key2, opts).success).toBe(true);
  });

  it("uses default values (60 requests, 60s window)", () => {
    const key = `test-defaults-${Date.now()}`;
    const result = rateLimit(key);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(59);
  });
});
