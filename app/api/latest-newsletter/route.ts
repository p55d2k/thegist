import { NextRequest, NextResponse } from "next/server";
import { getRecentEmailSends, getNewsletterJob } from "@/lib/firestore";
import { DEFAULT_LIMITS } from "@/constants/config";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const limitNum = limitParam
      ? parseInt(limitParam, 10)
      : DEFAULT_LIMITS.recentSends;

    const recent = await getRecentEmailSends(limitNum);
    if (!recent || recent.length === 0) {
      return NextResponse.json(
        { error: "No recent newsletter sends found" },
        { status: 404 }
      );
    }

    // Prefer sends that are ready-to-send or success and have planGeneratedAt
    let candidate = recent.find(
      (s) => s.status === "ready-to-send" || s.status === "success"
    );
    if (!candidate) {
      candidate = recent[0];
    }

    // Attempt to load the full newsletter job
    const job = await getNewsletterJob(candidate.id);
    if (!job) {
      return NextResponse.json(
        { error: `Newsletter job ${candidate.id} not found` },
        { status: 404 }
      );
    }

    const serialized = serializeNewsletterJob(job);

    return NextResponse.json({ job: serialized });
  } catch (error) {
    console.error("Error in latest-newsletter route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

function serializeNewsletterJob(job: any) {
  const clone: Record<string, any> = { ...job };

  const dateKeys = [
    "startedAt",
    "completedAt",
    "newsFetchedAt",
    "planGeneratedAt",
    "sendStartedAt",
    "lastBatchAt",
  ];

  for (const key of dateKeys) {
    const value = job[key];
    if (!value) {
      clone[key] = undefined;
      continue;
    }

    if (typeof value === "string") {
      try {
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

  // Ensure nested topics/publication dates are strings
  if (Array.isArray(clone.topics)) {
    clone.topics = clone.topics.map((t: any) => {
      const items = Array.isArray(t.items)
        ? t.items.map((it: any) => ({
            ...it,
            pubDate: String(it.pubDate ?? ""),
          }))
        : t.items;
      return { ...t, items };
    });
  }

  return clone;
}
