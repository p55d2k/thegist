// FOCUS: implement the task exactly as described. Do not add unrelated features or extra abstraction layers.
// MODIFY ONLY: edit `app/api/gemini/route.ts`, add `app/api/gemini/_helpers.ts`, and update `lib/gemini.ts` only if strictly necessary. Keep other files unchanged unless required for small helpers.
// IDEMPOTENT: ensure partial topic processing is safe to re-run and avoids duplicating stored data unless `force=true`.
// RETURN SHAPE: Follow the specified JSON response format for success and errors.

import { NextRequest, NextResponse } from "next/server";

import {
  getNewsletterJob,
  getNextNewsletterJobNeedingGemini,
  saveNewsletterPlanStage,
} from "@/lib/firestore";
import { formatArticles } from "@/lib/email";
import { getDateString } from "@/lib/date";
import { EMAIL_CONFIG } from "@/constants/email";
import {
  processGeminiTopic,
  deriveProcessableTopics,
  loadGeminiJobOrThrow,
  deserializeTopics,
  GeminiTopicProcessingError,
  getNextTopicToProcess,
} from "./_helpers";
import type { GeminiTopicKey } from "./_helpers";

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
      const result = await processGeminiTopic({
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
      if (error instanceof GeminiTopicProcessingError) {
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
  let job: Awaited<ReturnType<typeof getNewsletterJob>> = null;
  let sendIdResolved: string;

  if (sendId) {
    job = await getNewsletterJob(sendId);
    if (!job) {
      return NextResponse.json(
        { error: `Newsletter job ${sendId} not found` },
        { status: 404 }
      );
    }
    sendIdResolved = sendId;
  } else {
    const nextJob = await getNextNewsletterJobNeedingGemini();
    if (!nextJob) {
      return new NextResponse(null, { status: 204 });
    }
    sendIdResolved = nextJob.id;
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
      { message: "Job already completed", sendId: sendIdResolved },
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

  const nextTopic = getNextTopicToProcess(job, topics);

  if (!nextTopic) {
    // All topics processed, finalize the newsletter plan
    const partials = (job as any).aiPartial || {};
    const overall = partials.overall;
    if (!overall) {
      // Fallback, should not happen
      const formatted = await formatArticles(topics);
      await saveNewsletterPlanStage(sendIdResolved, {
        plan: formatted.plan,
        aiMetadata: formatted.aiMetadata,
        summaryText: formatted.plan.summary,
        emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
      });
    } else {
      const plan: GeminiNewsletterPlan = {
        essentialReads: {
          overview: overall.overview,
          highlights: overall.highlights,
        },
        summary: overall.summary,
        commentaries: partials.commentaries?.section || [],
        international: partials.international?.section || [],
        politics: partials.politics?.section || [],
        business: partials.business?.section || [],
        tech: partials.tech?.section || [],
        sport: partials.sport?.section || [],
        culture: partials.culture?.section || [],
        wildCard: partials.wildCard?.section || [],
        entertainment: partials.entertainment?.section || [],
        science: partials.science?.section || [],
        lifestyle: partials.lifestyle?.section || [],
      };
      await saveNewsletterPlanStage(sendIdResolved, {
        plan,
        aiMetadata: overall.aiMetadata,
        summaryText: overall.summary,
        emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
      });
    }
    return NextResponse.json(
      {
        message: "Newsletter plan generated",
        sendId: sendIdResolved,
        totalTopics: topics.length,
        totalArticles: topics.reduce((sum, t) => sum + t.items.length, 0),
        totalPublishers: new Set(topics.map((t) => t.publisher)).size,
      },
      { status: 200 }
    );
  } else {
    // Process the next unprocessed topic
    const result = await processGeminiTopic({
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
}
