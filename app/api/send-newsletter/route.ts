import { NextRequest, NextResponse } from "next/server";

import { getNextNewsletterJobForSending } from "@/lib/firestore";
import { sendNewsletterStep, NewsletterSendError } from "@/lib/email-send";

const AUTH_HEADER = "authorization";

const ensureAuthorized = (request: NextRequest): NextResponse | null => {
  const token = process.env.NEWSLETTER_JOB_TOKEN;
  if (!token) {
    return null;
  }

  const header = request.headers.get(AUTH_HEADER);
  const expected = `Bearer ${token}`;
  if (header !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
};

export async function POST(request: NextRequest) {
  const authResponse = ensureAuthorized(request);
  if (authResponse) {
    return authResponse;
  }

  let payload: { sendId?: string; maxBatches?: number } = {};
  try {
    payload = (await request.json()) ?? {};
  } catch (error) {
    // treat missing body as empty payload
  }

  if (payload.sendId && typeof payload.sendId !== "string") {
    return NextResponse.json(
      { error: "sendId must be a string" },
      { status: 400 }
    );
  }

  let sendId = payload.sendId;

  if (!sendId) {
    const nextJob = await getNextNewsletterJobForSending();
    if (!nextJob) {
      return new NextResponse(null, { status: 204 });
    }
    sendId = nextJob.id;
  }

  try {
    const result = await sendNewsletterStep(sendId, {
      maxBatches: payload.maxBatches,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof NewsletterSendError) {
      return NextResponse.json(
        { error: error.message, sendId },
        { status: error.status }
      );
    }
    throw error;
  }
}