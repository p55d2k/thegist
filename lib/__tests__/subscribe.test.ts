import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/subscribe/route";
import { addSubscriber } from "@/lib/firestore";
import { isValidEmail } from "@/lib/email";

vi.mock("@/lib/email", () => ({
  isValidEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/firestore", () => ({
  addSubscriber: vi.fn(),
}));

const mockedAddSubscriber = vi.mocked(addSubscriber);

const toRequest = (url: string, body?: Record<string, unknown>) =>
  new NextRequest(url, {
    method: "POST",
    headers: body
      ? new Headers({ "content-type": "application/json" })
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  vi.restoreAllMocks();
  delete (global as any).fetch;
  // Ensure default mocked implementations are in place
  vi.mocked(isValidEmail).mockResolvedValue(true);
});

describe("/api/subscribe route (reCAPTCHA)", () => {
  it("skips verification when RECAPTCHA_SECRET_KEY is not set and subscribes", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;

    mockedAddSubscriber.mockResolvedValue(true);

    const req = toRequest("http://localhost/api/subscribe", {
      email: "alice@example.com",
      nickname: "",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.alreadyExists).toBe(false);
  });

  it("returns 400 when secret configured but token missing", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "sekrit";

    const req = toRequest("http://localhost/api/subscribe", {
      email: "bob@example.com",
      nickname: "",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toMatch(/reCAPTCHA verification failed/i);
  });

  it("returns 400 when recaptcha returns low score", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "sekrit";

    // Mock Google's verify endpoint to return low score
    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: true, score: 0.2 }),
        } as unknown as Response)
    );

    const req = toRequest("http://localhost/api/subscribe", {
      email: "carol@example.com",
      nickname: "",
      recaptchaToken: "token-123",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toMatch(/reCAPTCHA verification failed/i);
  });

  it("accepts when recaptcha succeeds and adds subscriber (new)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "sekrit";

    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: true, score: 0.9 }),
        } as unknown as Response)
    );

    mockedAddSubscriber.mockResolvedValue(true);

    const req = toRequest("http://localhost/api/subscribe", {
      email: "dan@example.com",
      nickname: "",
      recaptchaToken: "token-123",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.alreadyExists).toBe(false);
  });

  it("accepts when recaptcha succeeds but subscriber already exists", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "sekrit";

    (global as any).fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: true, score: 0.95 }),
        } as unknown as Response)
    );

    mockedAddSubscriber.mockResolvedValue(false);

    const req = toRequest("http://localhost/api/subscribe", {
      email: "ellen@example.com",
      nickname: "",
      recaptchaToken: "token-123",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.alreadyExists).toBe(true);
  });
});
