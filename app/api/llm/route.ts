// FOCUS: implement the task exactly as described. Do not add unrelated features or extra abstraction layers.
// MODIFY ONLY: edit `app/api/llm/route.ts`, add `app/api/llm/_helpers.ts`, and update `lib/llm.ts` only if strictly necessary. Keep other files unchanged unless required for small helpers.
// IDEMPOTENT: ensure partial topic processing is safe to re-run and avoids duplicating stored data unless `force=true`.
// RETURN SHAPE: Follow the specified JSON response format for success and errors.

import { NextRequest, NextResponse } from "next/server";

import {
  getNewsletterJob,
  getNextNewsletterJobNeedingLLM,
  saveNewsletterPlanStage,
} from "@/lib/firestore";
import { getDateString } from "@/lib/date";
import { EMAIL_CONFIG } from "@/constants/email";
import { generateFinalOverview as generateLLMFinalOverview } from "@/lib/llm";
import {
  processTopicWithLLM,
  deserializeTopics,
  LLMTopicProcessingError,
  getNextTopicToProcess,
  type LLMTopicPartialRecord,
} from "./_helpers";

const generateFinalOverview = async (
  partials: Record<string, LLMTopicPartialRecord>,
  topics: TopicNewsGroup[]
): Promise<{
  overview: string;
  summary: string;
  highlights: NewsletterSectionItem[];
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
}> => {
  // Collect ALL selected articles from processed partials
  const allSelectedArticles: NewsletterSectionItem[] = [];
  for (const partial of Object.values(partials)) {
    allSelectedArticles.push(...partial.section);
  }

  if (allSelectedArticles.length === 0) {
    // Fallback if no articles available
    return {
      overview:
        "Today's essential reads cover the most important stories from across the news landscape.",
      summary: "A curated selection of today's most significant news stories.",
      highlights: [],
      aiMetadata: {
        model: "fallback",
        usedFallback: true,
        fallbackReason: "No articles available",
      },
    };
  }

  // Use LLM to generate overview/summary/highlights from ALL selected articles
  return await generateLLMFinalOverview(allSelectedArticles);
};

const SECTION_SEQUENCE: Array<
  keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">
> = [
  "commentaries",
  "international",
  "politics",
  "business",
  "tech",
  "science",
  "sport",
  "culture",
  "entertainment",
  "lifestyle",
  "wildCard",
];

const HEADLINE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "with",
  "without",
  "into",
  "onto",
  "after",
  "before",
  "over",
  "under",
  "more",
  "than",
  "less",
  "to",
  "from",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "about",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "done",
  "new",
  "latest",
  "breaking",
  "update",
  "report",
  "review",
  "video",
  "podcast",
  "exclusive",
]);

const normalizeArticleUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch (error) {
    return url.trim();
  }
};

const tokenizeHeadline = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[\u2019'’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !HEADLINE_STOPWORDS.has(token));

const buildTokenSet = (
  item: NewsletterSectionItem
): { tokens: Set<string>; hasTokens: boolean } => {
  const headlineTokens = tokenizeHeadline(item.title ?? "");
  const summaryTokens = tokenizeHeadline(item.summary ?? "");
  const combined = new Set<string>([...headlineTokens, ...summaryTokens]);
  return {
    tokens: combined,
    hasTokens: combined.size > 0,
  };
};

const shouldDropAsDuplicate = (
  currentTokens: Set<string>,
  existingTokens: Set<string>
): boolean => {
  if (currentTokens.size === 0 || existingTokens.size === 0) {
    return false;
  }

  let overlapCount = 0;
  let longOverlap = 0;

  currentTokens.forEach((token) => {
    if (existingTokens.has(token)) {
      overlapCount += 1;
      if (token.length >= 5) {
        longOverlap += 1;
      }
    }
  });

  if (overlapCount >= 5) {
    return true;
  }

  if (overlapCount >= 4 && longOverlap >= 2) {
    return true;
  }

  if (overlapCount >= 3) {
    const minSize = Math.min(currentTokens.size, existingTokens.size);
    const unionSize = new Set<string>([
      ...Array.from(currentTokens),
      ...Array.from(existingTokens),
    ]).size;
    const overlapRatio = overlapCount / minSize;
    const jaccard = overlapCount / unionSize;
    if (overlapRatio >= 0.55 || jaccard >= 0.45 || longOverlap >= 2) {
      return true;
    }
  }

  return false;
};

const deduplicatePlanSections = (
  plan: LLMNewsletterPlan
): {
  plan: LLMNewsletterPlan;
  removed: Array<{
    removedTitle: string;
    keptTitle: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  }>;
} => {
  const dedupedPlan: LLMNewsletterPlan = {
    ...plan,
    essentialReads: {
      overview: plan.essentialReads.overview,
      highlights: [...plan.essentialReads.highlights],
    },
    commentaries: [...plan.commentaries],
    international: [...plan.international],
    politics: [...plan.politics],
    business: [...plan.business],
    tech: [...plan.tech],
    sport: [...plan.sport],
    culture: [...plan.culture],
    wildCard: [...plan.wildCard],
    entertainment: [...plan.entertainment],
    science: [...plan.science],
    lifestyle: [...plan.lifestyle],
  };

  type DedupRecord = {
    tokens: Set<string>;
    link: string;
    slug?: string;
    title: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  };

  const seen: DedupRecord[] = [];
  const removed: Array<{
    removedTitle: string;
    keptTitle: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  }> = [];

  for (const section of SECTION_SEQUENCE) {
    const items = [...dedupedPlan[section]];
    const filtered: NewsletterSectionItem[] = [];

    items.forEach((item) => {
      const normalizedLink = normalizeArticleUrl(item.link);
      const slugKey = item.slug?.toLowerCase();

      const duplicateByLink = seen.find(
        (entry) => entry.link === normalizedLink
      );
      if (duplicateByLink) {
        removed.push({
          removedTitle: item.title,
          keptTitle: duplicateByLink.title,
          section,
        });
        return;
      }

      if (slugKey) {
        const duplicateBySlug = seen.find((entry) => entry.slug === slugKey);
        if (duplicateBySlug) {
          removed.push({
            removedTitle: item.title,
            keptTitle: duplicateBySlug.title,
            section,
          });
          return;
        }
      }

      const { tokens, hasTokens } = buildTokenSet(item);
      if (hasTokens) {
        const duplicateByTokens = seen.find((entry) =>
          shouldDropAsDuplicate(tokens, entry.tokens)
        );

        if (duplicateByTokens) {
          removed.push({
            removedTitle: item.title,
            keptTitle: duplicateByTokens.title,
            section,
          });
          return;
        }
      }

      filtered.push(item);
      seen.push({
        tokens,
        link: normalizedLink,
        slug: slugKey ?? undefined,
        title: item.title,
        section,
      });
    });

    dedupedPlan[section] = filtered;
  }

  return { plan: dedupedPlan, removed };
};

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
      { error: "No valid topics available for LLM planning" },
      { status: 400 }
    );
  }

  const nextTopic = getNextTopicToProcess(job, topics);

  if (!nextTopic) {
    // All topics processed, finalize the newsletter plan
    try {
      const partials = (job as any).aiPartial || {};

      let plan: LLMNewsletterPlan = {
        essentialReads: {
          overview:
            "Today's essential reads cover the most important stories from across the news landscape.",
          highlights: [],
        },
        summary:
          "A curated selection of today's most significant news stories.",
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

      const { plan: dedupedPlan, removed } = deduplicatePlanSections(plan);
      if (removed.length > 0) {
        console.log("[llm/finalize] Removed duplicate stories", {
          removed: removed.slice(0, 5),
          total: removed.length,
        });
      }
      plan = dedupedPlan;

      // Generate final overview/summary/highlights AFTER deduplication
      const allSelectedArticles: NewsletterSectionItem[] = [
        ...plan.commentaries,
        ...plan.international,
        ...plan.politics,
        ...plan.business,
        ...plan.tech,
        ...plan.sport,
        ...plan.culture,
        ...plan.wildCard,
        ...plan.entertainment,
        ...plan.science,
        ...plan.lifestyle,
      ];

      const finalOverview = await generateLLMFinalOverview(
        allSelectedArticles,
        plan
      );

      // Update plan with final overview
      plan.essentialReads.overview = finalOverview.overview;
      plan.essentialReads.highlights = finalOverview.highlights;
      plan.summary = finalOverview.summary;

      const highlightLinks = new Set(
        finalOverview.highlights.map((item) => normalizeArticleUrl(item.link))
      );

      const filterSection = (
        items: NewsletterSectionItem[]
      ): NewsletterSectionItem[] =>
        items.filter(
          (item) => !highlightLinks.has(normalizeArticleUrl(item.link))
        );

      plan.commentaries = filterSection(plan.commentaries);
      plan.international = filterSection(plan.international);
      plan.politics = filterSection(plan.politics);
      plan.business = filterSection(plan.business);
      plan.tech = filterSection(plan.tech);
      plan.sport = filterSection(plan.sport);
      plan.culture = filterSection(plan.culture);
      plan.entertainment = filterSection(plan.entertainment);
      plan.science = filterSection(plan.science);
      plan.lifestyle = filterSection(plan.lifestyle);

      await saveNewsletterPlanStage(sendIdResolved, {
        plan,
        aiMetadata: finalOverview.aiMetadata,
        summaryText: finalOverview.summary,
        emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
      });

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[llm/finalize] Finalization failed, using fallback plan", {
        error: message,
        sendId: sendIdResolved,
      });

      // Fallback: create a basic plan from partials without LLM calls
      const partials = (job as any).aiPartial || {};
      const fallbackPlan: LLMNewsletterPlan = {
        essentialReads: {
          overview:
            "Today's essential reads cover the most important stories from across the news landscape.",
          highlights: [],
        },
        summary: `Curated newsletter with ${
          Object.keys(partials).length
        } processed topics.`,
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

      // Select some highlights from the processed sections
      const allArticles = [
        ...fallbackPlan.commentaries,
        ...fallbackPlan.international,
        ...fallbackPlan.politics,
        ...fallbackPlan.business,
        ...fallbackPlan.tech,
        ...fallbackPlan.sport,
        ...fallbackPlan.culture,
        ...fallbackPlan.entertainment,
        ...fallbackPlan.science,
        ...fallbackPlan.lifestyle,
      ];
      fallbackPlan.essentialReads.highlights = allArticles.slice(0, 4);

      await saveNewsletterPlanStage(sendIdResolved, {
        plan: fallbackPlan,
        aiMetadata: {
          model: "fallback",
          usedFallback: true,
          fallbackReason: `Finalization failed: ${message}`,
        },
        summaryText: fallbackPlan.summary,
        emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
      });

      return NextResponse.json(
        {
          message: "Newsletter plan generated (fallback)",
          sendId: sendIdResolved,
          totalTopics: topics.length,
          totalArticles: topics.reduce((sum, t) => sum + t.items.length, 0),
          totalPublishers: new Set(topics.map((t) => t.publisher)).size,
        },
        { status: 200 }
      );
    }
  } else {
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
}
