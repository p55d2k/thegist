import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sendId, status, messageId, accepted, rejected } = body;

    if (!sendId || !status) {
      return NextResponse.json(
        { error: "sendId and status are required" },
        { status: 400 }
      );
    }

    // Update the status directly
    const statusRef = doc(db, "emailSends", sendId);
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

    await setDoc(statusRef, updateData, { merge: true });

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
