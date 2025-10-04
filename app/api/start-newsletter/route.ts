import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSubscribers,
  createNewsletterJobFromNews,
  findActiveNewsCollectionJob,
} from "@/lib/firestore";
import { DEFAULT_LIMITS } from "@/constants/config";

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

  // Check if there's already an active newsletter job
  const activeJob = await findActiveNewsCollectionJob();
  if (activeJob) {
    return NextResponse.json(
      {
        error: "Newsletter job already in progress",
        sendId: activeJob.id,
        jobStatus: activeJob.job.status,
      },
      { status: 409 }
    );
  }

  // Get subscribers and create initial empty job
  const recipients = await getActiveSubscribers();

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No subscribers found" },
      { status: 400 }
    );
  }

  // Create initial job with empty topics - news collection will populate it
  const job = await createNewsletterJobFromNews({
    topics: [],
    articlesSummary: {
      totalArticles: 0,
      totalTopics: 0,
      totalPublishers: 0,
    },
    recipients,
    batchSize: DEFAULT_LIMITS.batchSize,
    status: "news-collecting",
    newsCursor: 0,
    sourcesTotal: 0, // Will be set by first news call
  });

  return NextResponse.json(
    {
      message: "Newsletter job started",
      sendId: job.id,
      totalRecipients: recipients.length,
      jobStatus: job.status,
    },
    { status: 200 }
  );
}
