import { NextRequest, NextResponse } from "next/server";
import { getEmailSendStatus, getRecentEmailSends } from "@/lib/firestore";
import { DEFAULT_LIMITS } from "@/constants/config";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sendId = searchParams.get("id");
    const limit = searchParams.get("limit");

    // If sendId is provided, get specific send status
    if (sendId) {
      const status = await getEmailSendStatus(sendId);

      if (!status) {
        return NextResponse.json(
          { error: "Send ID not found" },
          { status: 404 }
        );
      }

      // Ensure all Date-like fields are serialized to ISO strings (UTC)
      const serializedStatus = serializeEmailSendStatus(status);
      return NextResponse.json({ status: serializedStatus });
    }

    // Otherwise, get recent sends
    const limitNum = limit ? parseInt(limit, 10) : DEFAULT_LIMITS.recentSends;
    const recentSends = await getRecentEmailSends(limitNum);

    // Serialize date fields to ISO strings so the client receives
    // timestamps in a predictable format (UTC). The client will
    // format for the user's timezone when rendering.
    const serialized = recentSends.map(serializeEmailSendStatus);

    return NextResponse.json({
      recentSends: serialized,
      count: serialized.length,
    });
  } catch (error) {
    console.error("Error getting email status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

// Helper to convert Date objects to ISO strings. Keeps other fields intact.
function serializeEmailSendStatus(status: any) {
  const clone: Record<string, any> = { ...status };

  const dateKeys = [
    "startedAt",
    "completedAt",
    "newsFetchedAt",
    "planGeneratedAt",
    "sendStartedAt",
    "lastBatchAt",
  ];

  for (const key of dateKeys) {
    const value = (status as any)[key];
    if (!value) {
      clone[key] = undefined;
      continue;
    }

    // If it's already a string, trust it; otherwise, try to convert to ISO
    if (typeof value === "string") {
      try {
        // normalize by parsing then re-serializing to an ISO string
        const d = new Date(value);
        clone[key] = isNaN(d.getTime()) ? value : d.toISOString();
      } catch (err) {
        clone[key] = value;
      }
    } else if (value?.toISOString) {
      try {
        clone[key] = value.toISOString();
      } catch (err) {
        clone[key] = String(value);
      }
    } else if (value?.toDate) {
      try {
        clone[key] = value.toDate().toISOString();
      } catch (err) {
        clone[key] = String(value);
      }
    } else {
      clone[key] = String(value);
    }
  }

  return clone;
}
