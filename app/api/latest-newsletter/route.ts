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

// Whitelist fields exposed to the public preview page. Never include
// PII (e.g. pendingRecipients) or heavy/irrelevant payloads.
const PUBLIC_JOB_FIELDS = [
  "id",
  "status",
  "batchSize",
  "pendingRecipientsCount",
  "sourcesTotal",
  "plan",
  "aiMetadata",
] as const;

const DATE_KEYS = [
  "startedAt",
  "completedAt",
  "newsFetchedAt",
  "planGeneratedAt",
  "sendStartedAt",
  "lastBatchAt",
];

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toISOString();
  }
  if (typeof (value as any).toISOString === "function") {
    try {
      return (value as Date).toISOString();
    } catch {
      return String(value);
    }
  }
  if (typeof (value as any).toDate === "function") {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  return String(value);
};

function serializeNewsletterJob(job: any) {
  const clone: Record<string, any> = {};

  for (const key of PUBLIC_JOB_FIELDS) {
    if (job[key] !== undefined) {
      clone[key] = job[key];
    }
  }

  // Normalize timestamps to ISO strings
  for (const key of DATE_KEYS) {
    const value = toIsoString(job[key]);
    if (value !== undefined) {
      clone[key] = value;
    }
  }

  return clone;
}
