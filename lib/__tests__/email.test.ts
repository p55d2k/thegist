import { describe, it, expect, vi, beforeEach } from "vitest";

import { isValidEmail } from "@/lib/email";

beforeEach(() => {
  vi.restoreAllMocks();
  // Ensure any previous fetch mock is removed between tests
  delete (global as unknown as Record<string, unknown>).fetch;
});

describe("isValidEmail", () => {
  it("returns false for blatantly invalid emails and does not call fetch", async () => {
    (global as any).fetch = vi.fn();

    const result = await isValidEmail("not-an-email");

    expect(result).toBe(false);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("returns true for a full positive Disify payload", async () => {
    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ format: true, dns: true, disposable: false }),
        } as unknown as Response)
    );

    const result = await isValidEmail("alice@example.com");

    expect((global as any).fetch).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when Disify reports dns=false in full payload", async () => {
    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ format: true, dns: false, disposable: false }),
        } as unknown as Response)
    );

    const result = await isValidEmail("bob@example.com");

    expect(result).toBe(false);
  });

  it("falls back to regex when Disify returns a partial payload (only format) and accepts the address", async () => {
    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ format: false }),
        } as unknown as Response)
    );

    // regex passes for this address, so partial response should not reject it
    const result = await isValidEmail("peanutandscuffy1@gmail.com");

    expect(result).toBe(true);
  });

  it("falls back to regex when Disify returns non-OK response", async () => {
    (global as any).fetch = vi.fn(
      async () => ({ ok: false } as unknown as Response)
    );

    const result = await isValidEmail("carol@example.com");

    expect(result).toBe(true);
  });

  it("falls back to regex when fetch throws (network error)", async () => {
    (global as any).fetch = vi.fn(async () => {
      throw new Error("network error");
    });

    const result = await isValidEmail("dan@example.com");

    expect(result).toBe(true);
  });
});
