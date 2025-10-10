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
});
