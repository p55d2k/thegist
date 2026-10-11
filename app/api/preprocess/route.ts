// Preprocess endpoint removed.
// This route previously ran an expensive preprocessing pipeline between news
// collection and LLM planning. The pipeline now runs in a single in-process
// worker (scripts/send-newsletter.ts), so this route only exists to return
// 410 Gone for legacy callers.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Preprocessing removed. Run scripts/send-newsletter.ts instead." },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { message: "Preprocess endpoint removed (deprecated)." },
    { status: 410 }
  );
}