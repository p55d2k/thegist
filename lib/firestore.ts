import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  orderBy,
  limit,
  Timestamp,
  getDoc,
  deleteField,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
// Use Node's built-in crypto.randomUUID to avoid CJS/ESM interop issues with uuid
import { randomUUID } from "node:crypto";
import {
  computeArticlesSummary,
  mergeSerializedTopics,
} from "@/lib/news-helpers";
import { computeTotalsFromPlan } from "@/lib/email";

export interface Subscriber {
  email: string;
  subscribedAt: Date;
  isActive: boolean;
}

export interface EmailSendStatus {
  id: string;
  startedAt: Date | Timestamp;
  completedAt?: Date | Timestamp;
  status:
    | "pending"
    | "news-collecting"
    | "news-ready"
    | "ready-to-send"
    | "sending"
    | "success"
    | "failed";
  totalRecipients: number;
  successfulRecipients: number;
  failedRecipients: number;
  pendingRecipientsCount?: number;
  nodeMailerResponse?: any;
  error?: string;
  articlesSummary: {
    totalArticles: number;
    totalTopics: number;
    totalPublishers: number;
  };
  newsFetchedAt?: Date | Timestamp;
  planGeneratedAt?: Date | Timestamp;
  sendStartedAt?: Date | Timestamp;
  lastBatchAt?: Date | Timestamp;
}

const SEND_COLLECTION = "emailSends";
const TOPIC_DOC_ID_PAD = 4;

const formatTopicDocId = (index: number): string =>
  `topic_${index.toString().padStart(TOPIC_DOC_ID_PAD, "0")}`;

const generateSendId = (): string => randomUUID();

const toDate = (value?: Date | Timestamp): Date | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
};

const removeUndefinedFields = (input: unknown): unknown => {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return input.map(removeUndefinedFields);
  }

  if (typeof input === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedFields(value);
      }
    }
    return cleaned;
  }

  return input;
};

export type SerializedProcessedNewsItem = {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  publisher: string;
  topic: string;
  slug: string;
  imageUrl?: string;
  sectionHints?: NewsletterSectionHint[];
};

export type SerializedTopicNewsGroup = {
  topic: string;
  slug: string;
  publisher: string;
  sectionHints: NewsletterSectionHint[];
  items: SerializedProcessedNewsItem[];
};

export interface NewsletterJob extends EmailSendStatus {
  topics?: SerializedTopicNewsGroup[];
  // Legacy clustering/deduplication fields from older workflows may still be
  // present in existing documents but are no longer produced by the current
  // news collection pipeline. Keep the job selection logic centered on `news-ready`
  // for LLM plan consumers.
  pendingRecipients?: string[];
  plan?: LLMNewsletterPlan;
  planId?: string; // Reference to the plan in newsletterPlans collection
  formattedHtml?: string;
  formattedText?: string;
  formattedRawText?: string;
  aiMetadata?: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
  summaryText?: string;
  emailSubject?: string;
  batchSize: number;
  newsCursor?: number;
  sourcesTotal?: number;
}

// Subscriber helpers -------------------------------------------------------

export async function addSubscriber(email: string): Promise<boolean> {
  try {
    const subscribersRef = collection(db, "subscribers");
    const existing = await getDocs(
      query(subscribersRef, where("email", "==", email))
    );

    if (!existing.empty) {
      return false;
    }

    await addDoc(subscribersRef, {
      email: email.toLowerCase().trim(),
      subscribedAt: new Date(),
      isActive: true,
    });

    return true;
  } catch (error) {
    console.error("Error adding subscriber:", error);
    throw new Error("Failed to add subscriber");
  }
}

export async function getActiveSubscribers(): Promise<string[]> {
  try {
    const subscribersRef = collection(db, "subscribers");
    const snapshot = await getDocs(
      query(subscribersRef, where("isActive", "==", true))
    );

    const emails: string[] = [];
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      if (typeof data.email === "string") {
        emails.push(data.email);
      }
    });

    return emails;
  } catch (error) {
    console.error("Error getting subscribers:", error);
    throw new Error("Failed to get subscribers");
  }
}

// Newsletter job pipeline --------------------------------------------------

export async function createNewsletterJobFromNews(payload: {
  topics: SerializedTopicNewsGroup[];
  articlesSummary: EmailSendStatus["articlesSummary"];
  recipients: string[];
  batchSize: number;
  sendId?: string;
  status?: NewsletterJob["status"];
  newsCursor?: number;
  sourcesTotal?: number;
}): Promise<NewsletterJob> {
  try {
    const id = payload.sendId ?? generateSendId();
    const ref = doc(db, SEND_COLLECTION, id);
    const now = new Date();

    const computedStatus =
      payload.recipients.length === 0
        ? "failed"
        : payload.status ?? "news-ready";

    const job: NewsletterJob = {
      id,
      startedAt: now,
      status: computedStatus,
      totalRecipients: payload.recipients.length,
      successfulRecipients: 0,
      failedRecipients: 0,
      pendingRecipientsCount: payload.recipients.length,
      articlesSummary: payload.articlesSummary,
      // topics: payload.topics, // Removed - now stored in subcollection
      pendingRecipients: payload.recipients,
      batchSize: payload.batchSize,
      newsFetchedAt: now,
      lastBatchAt: now,
      newsCursor: payload.newsCursor,
      sourcesTotal: payload.sourcesTotal,
    };

    if (payload.recipients.length === 0) {
      job.error = "No active subscribers found";
      job.pendingRecipients = [];
      job.completedAt = now;
    }

    // Save topics to subcollection
    await saveTopicsToSubcollection(id, payload.topics);

    await setDoc(ref, job);
    return job;
  } catch (error) {
    console.error("Error creating newsletter job:", error);
    throw new Error("Failed to create newsletter job");
  }
}

export class NewsJobCursorConflictError extends Error {
  constructor(message: string = "News job cursor advanced by another worker") {
    super(message);
    this.name = "NewsJobCursorConflictError";
  }
}

export async function findActiveNewsCollectionJob(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  try {
    const jobsRef = collection(db, SEND_COLLECTION);
    const jobsQuery = query(
      jobsRef,
      where("status", "==", "news-collecting"),
      orderBy("startedAt", "asc"),
      limit(1)
    );
    const snapshot = await getDocs(jobsQuery);
    if (snapshot.empty) {
      return null;
    }

    const docSnapshot = snapshot.docs[0];
    return {
      id: docSnapshot.id,
      job: docSnapshot.data() as NewsletterJob,
    };
  } catch (error) {
    console.error("Error finding active news collection job:", error);
    throw new Error("Failed to locate news collection job");
  }
}

export async function appendNewsBatchToJob(params: {
  id: string;
  expectedCursor: number;
  newTopics: SerializedTopicNewsGroup[];
  cursorIncrement: number;
  totalSources: number;
  // Optional: the incoming articles summary computed at fetch time (before any
  // trimming/compaction) so job-level totals reflect the initial fetched data.
  incomingArticlesSummary?: EmailSendStatus["articlesSummary"];
  // Optional: number of articles in the incoming batch (pre-trim)
  incomingAppendedArticles?: number;
}): Promise<{
  newsCursor: number;
  sourcesTotal: number;
  status: NewsletterJob["status"];
  articlesSummary: EmailSendStatus["articlesSummary"];
  appendedArticles: number;
  totalRecipients: number;
  pendingRecipientsCount: number;
}> {
  const { id, expectedCursor, newTopics, cursorIncrement, totalSources } =
    params;

  const topicsCollectionRef = collection(db, SEND_COLLECTION, id, "topics");
  const existingTopicsSnapshot = await getDocs(
    query(topicsCollectionRef, orderBy("__name__"))
  );
  const existingTopics: SerializedTopicNewsGroup[] = [];
  existingTopicsSnapshot.forEach((docSnapshot) => {
    existingTopics.push(docSnapshot.data() as SerializedTopicNewsGroup);
  });

  const mergeResult = mergeSerializedTopics(existingTopics, newTopics);
  const mergedTopics = mergeResult.topics;
  const appendedArticlesCount =
    params.incomingAppendedArticles ?? mergeResult.appendedArticles;
  const articlesSummary =
    params.incomingArticlesSummary ?? computeArticlesSummary(mergedTopics);
  const shouldRewriteTopics = mergeResult.appendedArticles > 0;

  return runTransaction(db, async (transaction) => {
    const ref = doc(db, SEND_COLLECTION, id);
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists()) {
      throw new Error(`Newsletter job ${id} not found`);
    }

    const jobData = snapshot.data() as NewsletterJob;
    const currentCursor = jobData.newsCursor ?? 0;

    if (currentCursor !== expectedCursor) {
      throw new NewsJobCursorConflictError();
    }

    const resolvedSourcesTotal = Math.max(
      totalSources,
      jobData.sourcesTotal ?? 0
    );

    const newCursor = Math.min(
      resolvedSourcesTotal,
      currentCursor + cursorIncrement
    );
    const isComplete = newCursor >= resolvedSourcesTotal;
    const now = new Date();

    // Prefer the incoming summary (computed by the fetch step) so totals
    // represent the original data before any server-side trimming/compaction.
    const nextStatus = isComplete ? "news-ready" : "news-collecting";

    transaction.set(
      ref,
      {
        // topics: mergedTopics, // Removed - now stored in subcollection
        newsCursor: newCursor,
        sourcesTotal: resolvedSourcesTotal,
        articlesSummary,
        status: nextStatus,
        newsFetchedAt: now,
        lastBatchAt: now,
      },
      { merge: true }
    );

    if (shouldRewriteTopics) {
      existingTopicsSnapshot.forEach((topicDoc) => {
        transaction.delete(topicDoc.ref);
      });

      mergedTopics.forEach((topic, index) => {
        const topicRef = doc(topicsCollectionRef, formatTopicDocId(index));
        transaction.set(topicRef, topic);
      });
    }

    return {
      newsCursor: newCursor,
      sourcesTotal: resolvedSourcesTotal,
      status: nextStatus,
      articlesSummary,
      appendedArticles: appendedArticlesCount,
      totalRecipients: jobData.totalRecipients,
      pendingRecipientsCount:
        jobData.pendingRecipientsCount ??
        jobData.pendingRecipients?.length ??
        0,
    };
  });
}

async function queryNewsletterJobs(
  statuses: NewsletterJob["status"][]
): Promise<Array<{ id: string; job: NewsletterJob }>> {
  const results: Array<{ id: string; job: NewsletterJob }> = [];

  for (const status of statuses) {
    const jobsRef = collection(db, SEND_COLLECTION);
    const jobsQuery = query(
      jobsRef,
      where("status", "==", status),
      orderBy("startedAt", "asc"),
      limit(1)
    );
    const snapshot = await getDocs(jobsQuery);
    if (snapshot.empty) {
      continue;
    }

    const docSnapshot = snapshot.docs[0];
    results.push({
      id: docSnapshot.id,
      job: docSnapshot.data() as NewsletterJob,
    });
  }

  return results.sort((a, b) => {
    const aStarted = toDate(a.job.startedAt)?.getTime() ?? 0;
    const bStarted = toDate(b.job.startedAt)?.getTime() ?? 0;
    return aStarted - bStarted;
  });
}

export async function getNewsletterJob(
  id: string
): Promise<NewsletterJob | null> {
  try {
    const ref = doc(db, SEND_COLLECTION, id);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const job = snapshot.data() as NewsletterJob & {
      aiPartial?: Record<string, any>;
    };

    // Load aiPartial from subcollection
    try {
      const aiPartialCollection = collection(
        db,
        SEND_COLLECTION,
        id,
        "aiPartial"
      );
      const aiPartialSnapshot = await getDocs(aiPartialCollection);
      const aiPartial: Record<string, any> = {};
      aiPartialSnapshot.forEach((doc) => {
        aiPartial[doc.id] = doc.data();
      });
      if (Object.keys(aiPartial).length > 0) {
        job.aiPartial = aiPartial;
      }
    } catch (error) {
      console.warn("Failed to load aiPartial from subcollection:", error);
    }

    // Load topics from subcollection
    try {
      job.topics = await loadTopicsFromSubcollection(id);
    } catch (error) {
      console.warn("Failed to load topics from subcollection:", error);
    }

    // If planId exists but plan is not loaded, load it from the separate collection
    if (job.planId && !job.plan) {
      const loadedPlan = await getNewsletterPlan(job.planId);
      if (loadedPlan) {
        job.plan = loadedPlan;
      }
    }

    // Rehydrate compact aiPartial sections saved by the LLM pipeline. To
    // conserve Firestore storage we persist a compact representation of
    // selected articles (title, link, slug, pubDate, publisher). Downstream
    // consumers expect full NewsletterSectionItem objects (including summary,
    // source, sectionHints). Try to find matching articles in job.topics and
    // augment the compact entries. If no match is found, keep the compact
    // record to avoid losing data.
    if (job.aiPartial && job.topics) {
      try {
        const topicsIndex = new Map<string, any>();
        for (const group of job.topics) {
          for (const article of group.items) {
            const keySlug = (article.slug || "").toLowerCase();
            if (keySlug) {
              topicsIndex.set(keySlug, article);
            }
            const keyLink = (article.link || "").toLowerCase();
            topicsIndex.set(keyLink, article);
          }
        }

        const augmented: Record<string, any> = {};
        for (const [key, value] of Object.entries(job.aiPartial)) {
          const rec = value as any;
          const section = Array.isArray(rec.section) ? rec.section : [];
          const expanded = section.map((s: any) => {
            const slug = (s.slug || "").toLowerCase();
            const link = (s.link || "").toLowerCase();
            const found =
              (link && topicsIndex.get(link)) ||
              (slug && topicsIndex.get(slug));
            if (found) {
              // Build NewsletterSectionItem-like object
              const pubDateValue = found.pubDate;
              const pubDateStr =
                typeof pubDateValue === "string"
                  ? pubDateValue
                  : pubDateValue &&
                    typeof (pubDateValue as any).toISOString === "function"
                  ? (pubDateValue as any).toISOString()
                  : String(pubDateValue ?? "");

              return {
                title: s.title ?? found.title,
                summary:
                  s.summary ??
                  (found.description ? String(found.description) : ""),
                link: found.link,
                publisher: found.publisher,
                topic: found.topic,
                slug: found.slug,
                source: found.source,
                pubDate: pubDateStr,
                sectionHints: found.sectionHints ?? [],
              } as NewsletterSectionItem;
            }
            // Fallback: return compact shape as-is but ensure pubDate is string
            return {
              title: s.title,
              summary: s.summary ?? "",
              link: s.link,
              publisher: s.publisher,
              topic: s.topic ?? "",
              slug: s.slug,
              source: s.source ?? "",
              pubDate:
                typeof s.pubDate === "string"
                  ? s.pubDate
                  : String(s.pubDate ?? ""),
              sectionHints: s.sectionHints ?? [],
            } as NewsletterSectionItem;
          });

          augmented[key] = {
            ...rec,
            section: expanded,
          };
        }

        (job as any).aiPartial = augmented;
      } catch (err) {
        // If anything fails during augmentation, leave aiPartial as stored
        console.warn("Failed to expand aiPartial compact records:", err);
      }
    }

    return job;
  } catch (error) {
    console.error("Error fetching newsletter job:", error);
    throw new Error("Failed to load newsletter job");
  }
}

// Legacy helper removed: clustering is now handled as part of the news
// collection pipeline. Keep the job selection logic centered on `news-ready`
// for LLM plan consumers.

export async function getNextNewsletterJobNeedingLLM(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  const jobsRef = collection(db, SEND_COLLECTION);
  const jobsQuery = query(
    jobsRef,
    where("status", "==", "news-ready"),
    orderBy("startedAt", "asc")
  );
  const snapshot = await getDocs(jobsQuery);

  const jobs: Array<{ id: string; job: NewsletterJob }> = [];
  snapshot.forEach((docSnapshot) => {
    jobs.push({
      id: docSnapshot.id,
      job: docSnapshot.data() as NewsletterJob,
    });
  });

  // Sort to prioritize jobs with aiPartial
  jobs.sort((a, b) => {
    const aHasPartial = !!(a.job as any).aiPartial;
    const bHasPartial = !!(b.job as any).aiPartial;
    if (aHasPartial && !bHasPartial) return -1;
    if (!aHasPartial && bHasPartial) return 1;
    return 0; // keep orderBy startedAt
  });

  return jobs[0] ?? null;
}

export async function getNextNewsletterJobForSending(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  // Only return jobs that are ready to send. Previously this included
  // "sending" which could cause multiple automation workers to pick the same job
  // and produce overlapping work. A proper lease/claim mechanism would be
  // more robust, but restricting to "ready-to-send" reduces the risk of
  // concurrent workers processing the same job.
  const results = await queryNewsletterJobs(["ready-to-send"]);
  return results[0] ?? null;
}

export async function markNewsletterJobAsSending(id: string): Promise<void> {
  try {
    const ref = doc(db, SEND_COLLECTION, id);
    await setDoc(
      ref,
      {
        status: "sending",
        sendStartedAt: new Date(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error marking job as sending:", error);
    throw new Error("Failed to mark job as sending");
  }
}

// Storage helpers for older clustering flows were removed — the dedicated
// external clustering endpoint is no longer part of the pipeline.

export async function saveNewsletterPlanStage(
  id: string,
  payload: {
    plan: LLMNewsletterPlan;
    aiMetadata: NewsletterJob["aiMetadata"];
    summaryText: string;
    emailSubject: string;
  }
): Promise<void> {
  try {
    const ref = doc(db, SEND_COLLECTION, id);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      throw new Error(`Newsletter job ${id} not found`);
    }

    const job = snapshot.data() as NewsletterJob;
    const remainingCount =
      job.pendingRecipientsCount ?? job.pendingRecipients?.length ?? 0;

    const totals = computeTotalsFromPlan(payload.plan);

    // Save the plan in a separate collection
    await saveNewsletterPlan(id, payload.plan);

    const update: Partial<NewsletterJob> & Record<string, unknown> = {
      planId: id, // Reference to the plan
      aiMetadata: payload.aiMetadata,
      summaryText: payload.summaryText,
      emailSubject: payload.emailSubject,
      planGeneratedAt: new Date(),
      status: remainingCount > 0 ? "ready-to-send" : "success",
      pendingRecipientsCount: remainingCount,
      articlesSummary: totals,
    };

    (update as Record<string, unknown>).error = deleteField();
    (update as Record<string, unknown>).formattedHtml = deleteField();
    (update as Record<string, unknown>).formattedText = deleteField();
    (update as Record<string, unknown>).formattedRawText = deleteField();

    if (remainingCount === 0) {
      update.completedAt = new Date();
      update.pendingRecipients = [];
      (update as Record<string, unknown>).topics = deleteField();
      (update as Record<string, unknown>).formattedHtml = deleteField();
      (update as Record<string, unknown>).formattedText = deleteField();
      (update as Record<string, unknown>).formattedRawText = deleteField();

      // Delete topics from subcollection
      await deleteTopicsSubcollection(id);
    }

    await setDoc(ref, update, { merge: true });
  } catch (error) {
    console.error("Error saving newsletter plan stage:", error);
    throw new Error("Failed to save newsletter plan stage");
  }
}

export async function recordNewsletterSendBatch(
  id: string,
  payload: {
    sentEmails: string[];
    acceptedCount: number;
    rejectedCount: number;
    nodeMailerResponse?: any;
    error?: string;
  }
): Promise<void> {
  try {
    const ref = doc(db, SEND_COLLECTION, id);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      throw new Error(`Newsletter job ${id} not found`);
    }

    const job = snapshot.data() as NewsletterJob;
    const now = new Date();

    if (payload.error) {
      await setDoc(
        ref,
        {
          status: "failed",
          error: payload.error,
          lastBatchAt: now,
        },
        { merge: true }
      );
      return;
    }

    const pending = job.pendingRecipients ?? [];
    const batchSize = payload.sentEmails.length;
    const remaining = pending.slice(batchSize);

    const update: Partial<NewsletterJob> & Record<string, unknown> = {
      successfulRecipients:
        (job.successfulRecipients ?? 0) + payload.acceptedCount,
      failedRecipients: (job.failedRecipients ?? 0) + payload.rejectedCount,
      pendingRecipients: remaining,
      pendingRecipientsCount: remaining.length,
      status: remaining.length > 0 ? "ready-to-send" : "success",
      lastBatchAt: now,
    };

    (update as Record<string, unknown>).error = deleteField();

    if (!job.sendStartedAt) {
      update.sendStartedAt = now;
    }

    if (payload.nodeMailerResponse) {
      update.nodeMailerResponse = removeUndefinedFields(
        payload.nodeMailerResponse
      );
    }

    if (remaining.length === 0) {
      update.completedAt = now;
      update.pendingRecipients = [];
      (update as Record<string, unknown>).topics = deleteField();
      (update as Record<string, unknown>).formattedHtml = deleteField();
      (update as Record<string, unknown>).formattedText = deleteField();
      (update as Record<string, unknown>).formattedRawText = deleteField();

      // Delete topics from subcollection
      await deleteTopicsSubcollection(id);
    }

    await setDoc(ref, update, { merge: true });
  } catch (error) {
    console.error("Error recording newsletter batch:", error);
    throw new Error("Failed to record newsletter batch");
  }
}

// Status helpers -----------------------------------------------------------

export async function getEmailSendStatus(
  id: string
): Promise<EmailSendStatus | null> {
  try {
    const statuses = await getDocs(
      query(collection(db, SEND_COLLECTION), where("id", "==", id), limit(1))
    );

    if (statuses.empty) {
      return null;
    }

    const data = statuses.docs[0].data() as NewsletterJob;
    const pending = data.pendingRecipients ?? [];
    const result: EmailSendStatus = {
      id: data.id,
      startedAt: toDate(data.startedAt) ?? new Date(),
      completedAt: toDate(data.completedAt),
      status: data.status,
      totalRecipients: data.totalRecipients,
      successfulRecipients: data.successfulRecipients,
      failedRecipients: data.failedRecipients,
      pendingRecipientsCount:
        data.pendingRecipientsCount ?? pending.length ?? 0,
      nodeMailerResponse: data.nodeMailerResponse,
      error: data.error,
      articlesSummary: data.articlesSummary,
      newsFetchedAt: toDate(data.newsFetchedAt),
      planGeneratedAt: toDate(data.planGeneratedAt),
      sendStartedAt: toDate(data.sendStartedAt),
      lastBatchAt: toDate(data.lastBatchAt),
    };

    return result;
  } catch (error) {
    console.error("Error getting email send status:", error);
    throw new Error("Failed to get email send status");
  }
}

export async function getRecentEmailSends(
  limitNum: number = 20
): Promise<EmailSendStatus[]> {
  try {
    const statusesQuery = query(
      collection(db, SEND_COLLECTION),
      orderBy("startedAt", "desc"),
      limit(limitNum)
    );
    const snapshot = await getDocs(statusesQuery);

    const statuses: EmailSendStatus[] = [];
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as NewsletterJob;
      const pending = data.pendingRecipients ?? [];

      statuses.push({
        id: data.id,
        startedAt: toDate(data.startedAt) ?? new Date(),
        completedAt: toDate(data.completedAt),
        status: data.status,
        totalRecipients: data.totalRecipients,
        successfulRecipients: data.successfulRecipients,
        failedRecipients: data.failedRecipients,
        pendingRecipientsCount:
          data.pendingRecipientsCount ?? pending.length ?? 0,
        nodeMailerResponse: data.nodeMailerResponse,
        error: data.error,
        articlesSummary: data.articlesSummary,
        newsFetchedAt: toDate(data.newsFetchedAt),
        planGeneratedAt: toDate(data.planGeneratedAt),
        sendStartedAt: toDate(data.sendStartedAt),
        lastBatchAt: toDate(data.lastBatchAt),
      });
    });

    return statuses;
  } catch (error) {
    console.error("Error getting recent email sends:", error);
    throw new Error("Failed to get recent email sends");
  }
}

export async function saveNewsletterPlan(
  id: string,
  plan: LLMNewsletterPlan
): Promise<void> {
  try {
    const ref = doc(db, "newsletterPlans", id);
    await setDoc(ref, {
      plan,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error saving newsletter plan:", error);
    throw new Error("Failed to save newsletter plan");
  }
}

export async function getNewsletterPlan(
  id: string
): Promise<LLMNewsletterPlan | null> {
  try {
    const ref = doc(db, "newsletterPlans", id);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data();
    return data.plan as LLMNewsletterPlan;
  } catch (error) {
    console.error("Error getting newsletter plan:", error);
    throw new Error("Failed to get newsletter plan");
  }
}

// Topics subcollection helpers --------------------------------------------

export async function saveTopicsToSubcollection(
  sendId: string,
  topics: SerializedTopicNewsGroup[]
): Promise<void> {
  try {
    const operations: Promise<void>[] = [];
    const topicsRef = collection(db, SEND_COLLECTION, sendId, "topics");

    // Delete existing topics first
    const existingSnapshot = await getDocs(topicsRef);
    existingSnapshot.forEach((doc) => {
      operations.push(deleteDoc(doc.ref));
    });

    // Add new topics
    topics.forEach((topic, index) => {
      const topicRef = doc(topicsRef, formatTopicDocId(index));
      operations.push(setDoc(topicRef, topic));
    });

    // Execute all operations
    await Promise.all(operations);
  } catch (error) {
    console.error("Error saving topics to subcollection:", error);
    throw new Error("Failed to save topics to subcollection");
  }
}

export async function loadTopicsFromSubcollection(
  sendId: string
): Promise<SerializedTopicNewsGroup[]> {
  try {
    const topicsRef = collection(db, SEND_COLLECTION, sendId, "topics");
    const snapshot = await getDocs(query(topicsRef, orderBy("__name__")));

    const topics: SerializedTopicNewsGroup[] = [];
    snapshot.forEach((doc) => {
      topics.push(doc.data() as SerializedTopicNewsGroup);
    });

    return topics;
  } catch (error) {
    console.error("Error loading topics from subcollection:", error);
    throw new Error("Failed to load topics from subcollection");
  }
}

export async function deleteTopicsSubcollection(sendId: string): Promise<void> {
  try {
    const topicsRef = collection(db, SEND_COLLECTION, sendId, "topics");
    const snapshot = await getDocs(topicsRef);

    const operations: Promise<void>[] = [];
    snapshot.forEach((doc) => {
      operations.push(deleteDoc(doc.ref));
    });

    await Promise.all(operations);
  } catch (error) {
    console.error("Error deleting topics subcollection:", error);
    // Don't throw - cleanup failures shouldn't break the flow
  }
}
