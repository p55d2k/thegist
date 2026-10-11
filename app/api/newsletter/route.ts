import { NextResponse } from "next/server";

const message =
  "This endpoint has been replaced by the single in-process pipeline worker (scripts/send-newsletter.ts). Run that script instead.";

export function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}
