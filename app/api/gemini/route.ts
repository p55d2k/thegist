import { NextRequest, NextResponse } from "next/server";

import {
  getNewsletterJob,
  getNextNewsletterJobNeedingGemini,
  saveNewsletterPlanStage,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import { formatArticles, formatRawBody, formatBody } from "@/lib/email";
import { getDateString } from "@/lib/date";
import { EMAIL_CONFIG } from "@/constants/email";

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

const deserializeTopics = (
  serialized: SerializedTopicNewsGroup[]
): TopicNewsGroup[] =>
  serialized.map((group) => ({
    topic: group.topic,
    slug: group.slug,
    publisher: group.publisher,
    sectionHints: group.sectionHints ?? [],
    items: group.items
      .map((item) => ({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date(item.pubDate),
        source: item.source,
        publisher: item.publisher,
        topic: item.topic,
        slug: item.slug,
        imageUrl: item.imageUrl,
        sectionHints: item.sectionHints ?? [],
      }))
      .filter((item) => !Number.isNaN(item.pubDate.getTime())),
  }));

export async function POST(request: NextRequest) {
  const authResponse = ensureAuthorized(request);
  if (authResponse) {
    return authResponse;
  }

  let sendId: string | undefined;
  let job: Awaited<ReturnType<typeof getNewsletterJob>> = null;

  try {
    const body = await request.json();
    sendId = body?.sendId;
  } catch (error) {
    // treat missing body as undefined sendId; ignore parsing errors
  }

  if (sendId && typeof sendId !== "string") {
    return NextResponse.json(
      { error: "sendId must be a string" },
      { status: 400 }
    );
  }

  if (sendId) {
    job = await getNewsletterJob(sendId);
    if (!job) {
      return NextResponse.json(
        { error: `Newsletter job ${sendId} not found` },
        { status: 404 }
      );
    }
  } else {
    const nextJob = await getNextNewsletterJobNeedingGemini();
    if (!nextJob) {
      return new NextResponse(null, { status: 204 });
    }
    sendId = nextJob.id;
    job = nextJob.job;
  }

  if (!job.topics || job.topics.length === 0) {
    return NextResponse.json(
      {
        error:
          "Newsletter job is missing topics. Run /api/news?persist=true first.",
      },
      { status: 400 }
    );
  }

  if (job.status === "success") {
    return NextResponse.json(
      { message: "Job already completed", sendId },
      { status: 200 }
    );
  }

  const topics = deserializeTopics(job.topics);

  if (topics.length === 0) {
    return NextResponse.json(
      { error: "No valid topics available for Gemini" },
      { status: 400 }
    );
  }

  // If preprocessed data is available in the job, use it
  // This happens when the workflow includes /api/preprocess between /news and /gemini
  const topicsToUse = job.preprocessedTopics
    ? deserializeTopics(job.preprocessedTopics)
    : topics;

  console.log(
    `[gemini] Processing ${topicsToUse.length} topics (${
      job.preprocessedTopics ? "preprocessed" : "original"
    })`
  );

  const formatted = await formatArticles(topicsToUse);

  await saveNewsletterPlanStage(sendId, {
    // Ensure the saved HTML includes the sendId so sent emails match the preview
    formattedHtml: formatBody(formatted, sendId),
    formattedText: formatted.text,
    formattedRawText: formatRawBody(formatted, sendId),
    aiMetadata: formatted.aiMetadata,
    summaryText: formatted.plan.summary,
    emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
  });

  return NextResponse.json(
    {
      message: "Newsletter plan generated",
      sendId,
      totalTopics: formatted.totalTopics,
      totalArticles: formatted.totalArticles,
      totalPublishers: formatted.totalPublishers,
    },
    { status: 200 }
  );
}
