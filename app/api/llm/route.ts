import { NextRequest, NextResponse } from "next/server";

import {
  getNewsletterJob,
  getNextNewsletterJobNeedingLLM,
} from "@/lib/firestore";
import {
  processTopicWithLLM,
  deserializeTopics,
  getNextTopicToProcess,
  finalizeNewsletterPlan,
  LLMTopicProcessingError,
} from "@/lib/llm-planning";

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

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
};

const extractBody = async (
  request: NextRequest
): Promise<Record<string, unknown>> => {
  try {
    const payload = await request.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch (error) {
    // ignore malformed or missing body
  }
  return {};
};

export async function POST(request: NextRequest) {
  const authResponse = ensureAuthorized(request);
  if (authResponse) {
    return authResponse;
  }

  const searchParams = request.nextUrl.searchParams;
  const body = await extractBody(request);

  let sendId: string | undefined;
  const bodySendId = body["sendId"];
  if (typeof bodySendId === "string") {
    sendId = bodySendId;
  } else if (bodySendId !== undefined && bodySendId !== null) {
    return NextResponse.json(
      { error: "sendId must be a string" },
      { status: 400 }
    );
  } else {
    const querySendId = searchParams.get("sendId");
    if (querySendId) {
      sendId = querySendId;
    }
  }

  const topicQuery = searchParams.get("topic");
  const topic = topicQuery
    ? topicQuery
    : typeof body["topic"] === "string"
    ? (body["topic"] as string)
    : undefined;

  const limitParam = (() => {
    const value = searchParams.get("limit");
    if (value !== null) {
      return value;
    }
    const bodyValue = body["limit"];
    if (typeof bodyValue === "number" || typeof bodyValue === "string") {
      return bodyValue;
    }
    return undefined;
  })();

  const extraParam = (() => {
    const value = searchParams.get("extra");
    if (value !== null) {
      return value;
    }
    const bodyValue = body["extra"];
    if (typeof bodyValue === "number" || typeof bodyValue === "string") {
      return bodyValue;
    }
    return undefined;
  })();

  const forceParam = searchParams.get("force") ?? body["force"];

  const force = parseBoolean(forceParam) ?? false;

  if (topic) {
    try {
      const result = await processTopicWithLLM({
        sendId,
        topic,
        limit: limitParam,
        extra: extraParam,
        force,
      });

      return NextResponse.json(
        {
          message: result.message,
          sendId: result.sendId,
          topic: result.topic,
          articlesUsed: result.articlesUsed,
          candidatesFetched: result.candidatesFetched,
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof LLMTopicProcessingError) {
        return NextResponse.json(
          error.details
            ? { error: error.message, details: error.details }
            : { error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }
  }

  // Incremental processing
  let job: Awaited<ReturnType<typeof getNewsletterJob>> | null = null;
  let sendIdResolved: string;

  if (sendId) {
    const fetchedJob = await getNewsletterJob(sendId);
    if (!fetchedJob) {
      return NextResponse.json(
        { error: `Newsletter job ${sendId} not found` },
        { status: 404 }
      );
    }
    job = fetchedJob;
    sendIdResolved = sendId;
  } else {
    const nextJob = await getNextNewsletterJobNeedingLLM();
    if (!nextJob) {
      return new NextResponse(null, { status: 204 });
    }
    sendIdResolved = nextJob.id;
    job = nextJob.job;
  }

  if (!job) {
    return NextResponse.json(
      { error: "Newsletter job could not be resolved" },
      { status: 500 }
    );
  }

  if (!job.topics || job.topics.length === 0) {
    return NextResponse.json(
      {
        error: "Newsletter job is missing topics. Run /api/news?persist=true first.",
      },
      { status: 400 }
    );
  }

  if (job.status === "success") {
    return NextResponse.json(
      { message: "Job already completed", sendId: sendIdResolved },
      { status: 200 }
    );
  }

  const topics = deserializeTopics(job.topics);

  if (topics.length === 0) {
    return NextResponse.json(
      { error: "No valid topics available for LLM planning" },
      { status: 400 }
    );
  }

  const nextTopic = getNextTopicToProcess(job, topics);

  if (!nextTopic) {
    // All topics processed, finalize the newsletter plan
    const result = await finalizeNewsletterPlan(sendIdResolved);
    return NextResponse.json(
      {
        message: result.message,
        sendId: result.sendId,
        totalTopics: result.totalTopics,
        totalArticles: result.totalArticles,
        totalPublishers: result.totalPublishers,
      },
      { status: 200 }
    );
  }

  // Process the next unprocessed topic
  const result = await processTopicWithLLM({
    sendId: sendIdResolved,
    topic: nextTopic,
    limit: limitParam,
    extra: extraParam,
    force,
  });

  return NextResponse.json(
    {
      message: result.message,
      sendId: result.sendId,
      topic: result.topic,
      articlesUsed: result.articlesUsed,
      candidatesFetched: result.candidatesFetched,
    },
    { status: 200 }
  );
}