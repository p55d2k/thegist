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

      return NextResponse.json({ status });
    }

    // Otherwise, get recent sends
    const limitNum = limit ? parseInt(limit, 10) : DEFAULT_LIMITS.recentSends;
    const recentSends = await getRecentEmailSends(limitNum);

    return NextResponse.json({
      recentSends,
      count: recentSends.length,
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
