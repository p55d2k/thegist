import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";

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
  try {
    const authResponse = ensureAuthorized(request);
    if (authResponse) {
      return authResponse;
    }

    const body = await request.json();
    const { sendId, status, messageId, accepted, rejected } = body;

    if (!sendId || !status) {
      return NextResponse.json(
        { error: "sendId and status are required" },
        { status: 400 }
      );
    }

    // Update the status directly
    const statusRef = db.collection("emailSends").doc(sendId);
    const updateData: any = {
      completedAt: new Date(),
      status,
    };

    if (messageId || accepted || rejected) {
      updateData.nodeMailerResponse = {};
      if (messageId) updateData.nodeMailerResponse.messageId = messageId;
      if (accepted) updateData.nodeMailerResponse.accepted = accepted;
      if (rejected) updateData.nodeMailerResponse.rejected = rejected;
    }

    if (status === "success" && accepted) {
      updateData.successfulRecipients = Array.isArray(accepted)
        ? accepted.length
        : 1;
      updateData.failedRecipients = Array.isArray(rejected)
        ? rejected.length
        : 0;
    }

    await statusRef.set(updateData, { merge: true });

    return NextResponse.json({
      message: "Status updated successfully",
      sendId,
      status,
    });
  } catch (error) {
    console.error("Error fixing email status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
