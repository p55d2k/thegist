import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  preprocessArticles,
  articleCache,
  type PreprocessStats,
} from "@/lib/preprocess";
import {
  getNewsletterJob,
  getNextNewsletterJobNeedingPreprocessing,
  savePreprocessedData,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * POST /api/preprocess
 *
 * Preprocesses articles from /api/news:
 * - Deduplicates by URL
 * - Clusters similar articles by title
 * - Saves to Firestore for /api/gemini to use
 *
 * Flow: /news → /preprocess → /gemini → /send-newsletter
 *
 * Body:
 * {
 *   "sendId": "optional-job-id",  // If omitted, uses next pending job
 *   "options": {
 *     "similarityThreshold": 0.75,
 *     "maxClusterSize": 10,
 *     "preferredPublishers": ["BBC", "CNN", "NPR"]
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "sendId": "2024-01-01-abc123",
 *   "stats": PreprocessStats
 * }
 */
export async function POST(request: NextRequest) {
  const authResponse = ensureAuthorized(request);
  if (authResponse) {
    return authResponse;
  }
  const startTime = Date.now();

  let sendId: string | undefined;
  let job: Awaited<ReturnType<typeof getNewsletterJob>> = null;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    sendId = body?.sendId;
    const options = body?.options || {};

    if (sendId && typeof sendId !== "string") {
      return NextResponse.json(
        { error: "sendId must be a string" },
        { status: 400 }
      );
    }

    // Get the newsletter job
    if (sendId) {
      job = await getNewsletterJob(sendId);
      if (!job) {
        return NextResponse.json(
          { error: `Newsletter job ${sendId} not found` },
          { status: 404 }
        );
      }
    } else {
      const nextJob = await getNextNewsletterJobNeedingPreprocessing();
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

    // Flatten all articles from all topic groups
    const allArticles: ProcessedNewsItem[] = [];
    for (const topicGroup of job.topics) {
      for (const item of topicGroup.items) {
        allArticles.push({
          ...item,
          pubDate: new Date(item.pubDate),
          sectionHints: item.sectionHints ?? [],
        });
      }
    }

    if (allArticles.length === 0) {
      return NextResponse.json(
        { error: "No articles found in newsletter job" },
        { status: 400 }
      );
    }

    // Generate cache key based on article links
    const cacheKey = allArticles
      .map((a: any) => a.link)
      .sort()
      .join("|")
      .substring(0, 100);

    // Check cache (30 minute TTL)
    const cached = articleCache.get(cacheKey);
    if (cached) {
      console.log(`[preprocess] Cache HIT for ${allArticles.length} articles`);
      return NextResponse.json({
        success: true,
        sendId,
        stats: {
          originalCount: allArticles.length,
          afterDedupeCount: cached.length,
          clusterCount: cached.length,
          representativeCount: cached.length,
          reductionPercent: Math.round(
            ((allArticles.length - cached.length) / allArticles.length) * 100
          ),
          processingTimeMs: Date.now() - startTime,
        },
        cached: true,
      });
    }

    // Parse preferred publishers
    const preferredPublishers = new Set<string>(
      options.preferredPublishers || [
        "BBC",
        "CNN",
        "NPR",
        "The Guardian",
        "Al Jazeera",
      ]
    );

    // Run preprocessing pipeline with GRAPH-BASED + TOPIC-AWARE clustering
    const { representatives, stats } = preprocessArticles(allArticles, {
      similarityThreshold: options.similarityThreshold || 0.15, // LOWERED from 0.2 for even more aggressive clustering
      maxClusterSize: options.maxClusterSize || 20, // Max cluster size: 20
      preferredPublishers,
      useGraphClustering:
        options.useGraphClustering !== undefined
          ? options.useGraphClustering
          : true, // DEFAULT: graph-based
      topicAware: options.topicAware !== undefined ? options.topicAware : true, // DEFAULT: topic-aware
    });

    // Cache results
    articleCache.set(cacheKey, representatives, 30 * 60 * 1000); // 30 min TTL

    console.log(
      `[preprocess] Processed ${allArticles.length} → ${representatives.length} articles (${stats.reductionPercent}% reduction) in ${stats.processingTimeMs}ms`
    );

    // Reconstruct topic groups with only representative articles
    const topicGroups = new Map<string, SerializedTopicNewsGroup>();

    for (const article of representatives) {
      const key = `${article.publisher}-${article.topic}`;
      if (!topicGroups.has(key)) {
        topicGroups.set(key, {
          publisher: article.publisher,
          topic: article.topic,
          slug: article.slug,
          sectionHints: article.sectionHints,
          items: [],
        });
      }

      topicGroups.get(key)!.items.push({
        title: article.title,
        description: article.description,
        link: article.link,
        pubDate: article.pubDate.toISOString(),
        source: article.source,
        publisher: article.publisher,
        topic: article.topic,
        slug: article.slug,
        imageUrl: article.imageUrl,
        sectionHints: article.sectionHints,
      });
    }

    const preprocessedTopics = Array.from(topicGroups.values());

    // Save to Firestore
    await savePreprocessedData(sendId, {
      preprocessedTopics,
      preprocessStats: {
        originalCount: stats.originalCount,
        representativeCount: stats.representativeCount,
        reductionPercent: stats.reductionPercent,
        processingTimeMs: stats.processingTimeMs,
      },
    });

    return NextResponse.json({
      success: true,
      sendId,
      stats,
      cached: false,
    });
  } catch (error: any) {
    console.error("[preprocess] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Preprocessing failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/preprocess
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Preprocess API is ready",
    timestamp: new Date().toISOString(),
  });
}
