import { NextResponse } from "next/server";

const message =
  "This endpoint has been replaced by the staged workflow. Trigger /api/news, /api/llm, and /api/send-newsletter instead.";

export function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}
