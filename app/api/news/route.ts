import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { links } from "@/constants/links";
import {
  findActiveNewsCollectionJob,
  appendNewsBatchToJob,
  NewsJobCursorConflictError,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import {
  DEFAULT_LIMITS,
  ONE_DAY_MS,
  CACHE_HEADERS,
} from "@/constants/config";
import { fetchNewsForLinks } from "@/lib/news";
import { computeArticlesSummary } from "@/lib/news-helpers";

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

export async function GET(req: NextRequest) {
  const authResponse = ensureAuthorized(req);
  if (authResponse) {
    return authResponse;
  }

  revalidatePath("/api/news");

  const searchParams = req.nextUrl.searchParams;
  const persist = searchParams.get("persist") !== "false";
  const batchSizeParam = searchParams.get("batchSize");
  const sourcesParam = searchParams.get("sources");

  const batchSize = Number.isFinite(Number(batchSizeParam))
    ? Math.max(1, Number.parseInt(batchSizeParam ?? "50", 10))
    : DEFAULT_LIMITS.batchSize;

  const totalSources = links.length;
  const defaultSourcesPerRun = Math.max(
    1,
    Math.min(DEFAULT_LIMITS.newsSourcesPerRun, Math.max(1, totalSources))
  );
  const parsedSources = Number.parseInt(sourcesParam ?? "", 10);
  const sourcesPerRun = Number.isFinite(parsedSources)
    ? Math.max(1, Math.min(parsedSources, Math.max(1, totalSources)))
    : defaultSourcesPerRun;

  const maxAgeParam = searchParams.get("maxAgeDays");
  const parsedMaxAge = Number.isFinite(Number(maxAgeParam))
    ? Math.max(0, Number.parseInt(maxAgeParam ?? "7", 10))
    : 7;

  const oneWeekAgo = new Date(Date.now() - parsedMaxAge * ONE_DAY_MS);

  if (!persist) {
    const newsResult = await fetchNewsForLinks(links, oneWeekAgo);

    const basePayload: Record<string, unknown> = {
      message: `Retrieved ${newsResult.allNews.length} items across ${newsResult.topics.length} topic feeds`,
      count: newsResult.allNews.length,
      maxAgeDays: parsedMaxAge,
    };

    const fullPayload = {
      ...basePayload,
      topics: newsResult.topics,
      news: newsResult.allNews,
    };

    const response = NextResponse.json(fullPayload, { status: 200 });
    applyCacheHeaders(response);
    return response;
  }

  if (totalSources === 0) {
    return new NextResponse(null, { status: 204 });
  }

  let message = "";
  let count = 0;
  let persistenceInfo: Record<string, unknown> | undefined;

  const activeJob = await findActiveNewsCollectionJob();

  if (!activeJob) {
    return NextResponse.json(
      {
        error:
          "No active newsletter job found. Start a job with /api/start-newsletter first.",
      },
      { status: 400 }
    );
  }

  const { id, job } = activeJob;
  const currentCursor = job.newsCursor ?? 0;
  const resolvedSourcesTotal = Math.max(totalSources, job.sourcesTotal ?? 0);

  if (currentCursor >= resolvedSourcesTotal) {
    return new NextResponse(null, { status: 204 });
  }

  const slice = links.slice(
    currentCursor,
    Math.min(resolvedSourcesTotal, currentCursor + sourcesPerRun)
  );

  if (slice.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const newsResult = await fetchNewsForLinks(slice, oneWeekAgo);

  try {
    const appendResult = await appendNewsBatchToJob({
      id,
      expectedCursor: currentCursor,
      newTopics: newsResult.serializedTopics,
      cursorIncrement: slice.length,
      totalSources: resolvedSourcesTotal,
      incomingArticlesSummary: newsResult.articlesSummary,
      incomingAppendedArticles: newsResult.allNews.length,
    });

    message =
      appendResult.status === "news-ready"
        ? `Completed news collection job: processed ${slice.length} sources this run`
        : `Appended ${slice.length} sources (${appendResult.newsCursor}/${appendResult.sourcesTotal})`;

    count = appendResult.articlesSummary.totalArticles;

    persistenceInfo = {
      persisted: true,
      sendId: id,
      totalRecipients: appendResult.totalRecipients,
      pendingRecipients: appendResult.pendingRecipientsCount,
      batchSize,
      jobStatus: appendResult.status,
      processedSources: appendResult.newsCursor,
      remainingSources: Math.max(
        appendResult.sourcesTotal - appendResult.newsCursor,
        0
      ),
      totalSources: appendResult.sourcesTotal,
      batchSources: slice.length,
      batchArticles: newsResult.allNews.length,
      appendedArticles: appendResult.appendedArticles,
      totalArticles: appendResult.articlesSummary.totalArticles,
      totalTopics: appendResult.articlesSummary.totalTopics,
      totalPublishers: appendResult.articlesSummary.totalPublishers,
      sourcesPerRun,
    };
  } catch (error) {
    if (error instanceof NewsJobCursorConflictError) {
      const response = NextResponse.json(
        {
          error: "News job cursor advanced by another worker. Retry shortly.",
        },
        { status: 409 }
      );
      applyCacheHeaders(response);
      return response;
    }
    throw error;
  }

  if (!persistenceInfo) {
    persistenceInfo = { persisted: false, sourcesPerRun };
  }

  if (!message) {
    message = "Processed news batch.";
  }

  if (
    count === 0 &&
    typeof (persistenceInfo as Record<string, unknown>).totalArticles ===
      "number"
  ) {
    count = (persistenceInfo as { totalArticles: number }).totalArticles;
  }

  const basePayload = {
    message,
    count,
    ...persistenceInfo,
  };

  const response = NextResponse.json(basePayload, { status: 200 });
  applyCacheHeaders(response);
  return response;
}

type FetchNewsResult = {
  topics: TopicNewsGroup[];
  serializedTopics: SerializedTopicNewsGroup[];
  allNews: ProcessedNewsItem[];
  articlesSummary: ReturnType<typeof computeArticlesSummary>;
};

const applyCacheHeaders = (response: NextResponse) => {
  response.headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
  response.headers.set("Pragma", CACHE_HEADERS.Pragma);
  response.headers.set("Expires", CACHE_HEADERS.Expires);
  response.headers.set("Surrogate-Control", CACHE_HEADERS["Surrogate-Control"]);
};
