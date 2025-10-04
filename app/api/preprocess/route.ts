// Preprocess endpoint removed.
// This route previously ran an expensive preprocessing pipeline between
// `/api/news` and `/api/llm`. The preprocessing step has been removed and
// the current pipeline expects `/api/llm` to follow `/api/news`.
//
// To avoid accidental usage, this route now returns 410 Gone for all calls.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Preprocessing removed. Call /api/llm after /api/news." },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { message: "Preprocess endpoint removed (deprecated)." },
    { status: 410 }
  );
}
