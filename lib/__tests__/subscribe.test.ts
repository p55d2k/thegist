import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/subscribe/route";
import { addSubscriber } from "@/lib/firestore";
import { isValidEmail } from "@/lib/email-validation";
import { clearAllRateLimits } from "@/lib/rate-limit";

vi.mock("@/lib/email-validation", () => ({
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
  clearAllRateLimits();
  // Ensure default mocked implementations are in place
  vi.mocked(isValidEmail).mockResolvedValue(true);
});

describe("/api/subscribe route", () => {
  it("subscribes when request is valid (new)", async () => {
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

  it("returns 400 when email missing or invalid", async () => {
    const req = toRequest("http://localhost/api/subscribe", {
      nickname: "",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 200 when subscriber already exists", async () => {
    mockedAddSubscriber.mockResolvedValue(false);

    const req = toRequest("http://localhost/api/subscribe", {
      email: "ellen@example.com",
      nickname: "",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.alreadyExists).toBe(true);
  });

  it("returns 400 when server-side validation rejects the email", async () => {
    vi.mocked(isValidEmail).mockResolvedValue(false);

    const req = toRequest("http://localhost/api/subscribe", {
      email: "bob@example.com",
      nickname: "",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    expect(mockedAddSubscriber).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions without subscribing", async () => {
    const req = toRequest("http://localhost/api/subscribe", {
      email: "bot@example.com",
      nickname: "I-am-a-bot",
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(201);
    expect(mockedAddSubscriber).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded for the client IP", async () => {
    mockedAddSubscriber.mockResolvedValue(true);

    const baseReq = () =>
      toRequest("http://localhost/api/subscribe", {
        email: "carol@example.com",
        nickname: "",
      });

    // Consume the allowed quota (default 6 per minute)
    let res: Response = new Response();
    for (let i = 0; i < 6; i += 1) {
      res = await POST(baseReq() as unknown as NextRequest);
    }

    expect(res.status).toBe(201);

    const blocked = await POST(baseReq() as unknown as NextRequest);
    expect(blocked.status).toBe(429);
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/subscribe", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: "{not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});