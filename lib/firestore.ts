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
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { v4 as uuidv4 } from "uuid";

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
    | "news-ready"
    | "preprocessed"
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

const generateSendId = (): string => uuidv4();

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
  preprocessedTopics?: SerializedTopicNewsGroup[];
  preprocessedBySection?: Record<
    NewsletterSectionHint,
    SerializedProcessedNewsItem[]
  >;
  preprocessedByTopic?: Record<string, SerializedProcessedNewsItem[]>;
  preprocessStats?: {
    originalCount: number;
    representativeCount: number;
    reductionPercent: number;
    processingTimeMs: number;
  };
  pendingRecipients?: string[];
  plan?: GeminiNewsletterPlan;
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
}): Promise<NewsletterJob> {
  try {
    const id = payload.sendId ?? generateSendId();
    const ref = doc(db, SEND_COLLECTION, id);
    const now = new Date();

    const job: NewsletterJob = {
      id,
      startedAt: now,
      status: payload.recipients.length === 0 ? "failed" : "news-ready",
      totalRecipients: payload.recipients.length,
      successfulRecipients: 0,
      failedRecipients: 0,
      pendingRecipientsCount: payload.recipients.length,
      articlesSummary: payload.articlesSummary,
      topics: payload.topics,
      pendingRecipients: payload.recipients,
      batchSize: payload.batchSize,
      newsFetchedAt: now,
    };

    if (payload.recipients.length === 0) {
      job.error = "No active subscribers found";
      job.pendingRecipients = [];
      job.completedAt = now;
    }

    await setDoc(ref, job);
    return job;
  } catch (error) {
    console.error("Error creating newsletter job:", error);
    throw new Error("Failed to create newsletter job");
  }
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
    return snapshot.data() as NewsletterJob;
  } catch (error) {
    console.error("Error fetching newsletter job:", error);
    throw new Error("Failed to load newsletter job");
  }
}

export async function getNextNewsletterJobNeedingPreprocessing(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  const [result] = await queryNewsletterJobs(["news-ready"]);
  return result ?? null;
}

export async function getNextNewsletterJobNeedingGemini(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  const [result] = await queryNewsletterJobs(["preprocessed"]);
  return result ?? null;
}

export async function getNextNewsletterJobForSending(): Promise<{
  id: string;
  job: NewsletterJob;
} | null> {
  // Only return jobs that are ready to send. Previously this included
  // "sending" which could cause multiple cron workers to pick the same job
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

export async function savePreprocessedData(
  id: string,
  payload: {
    preprocessedTopics: SerializedTopicNewsGroup[];
    /** Optional: preprocessed articles grouped by target newsletter sections (commentaries, international, etc.) */
    preprocessedBySection?: Record<
      NewsletterSectionHint,
      SerializedProcessedNewsItem[]
    >;
    /** Optional: preprocessed articles grouped by publisher/topic (more granular)
     * Keys are arbitrary topic strings (e.g., 'business', 'tech', 'opinion').
     */
    preprocessedByTopic?: Record<string, SerializedProcessedNewsItem[]>;
    preprocessStats: NewsletterJob["preprocessStats"];
  }
): Promise<void> {
  try {
    const ref = doc(db, SEND_COLLECTION, id);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      throw new Error(`Newsletter job ${id} not found`);
    }

    // Prepare cleaned payload for the main job document. We'll try to write
    // the bulk data directly, but if the serialized size would exceed
    // Firestore's 1MB limit we move large sections into subcollection
    // documents under emailSends/{id}/preprocessedByTopic and
    // emailSends/{id}/preprocessedBySection. This keeps backwards
    // compatibility by leaving a small index on the main document.

    const cleanedPayload: Record<string, unknown> = {
      preprocessedTopics: removeUndefinedFields(payload.preprocessedTopics),
      preprocessStats: payload.preprocessStats,
      status: "preprocessed",
    };

    // Helper: estimate size of an object once stringified
    const estimateSize = (obj: unknown) => {
      try {
        return Buffer.byteLength(JSON.stringify(obj || {}), "utf8");
      } catch {
        return 0;
      }
    };

    // Helper: create a safe doc id from an arbitrary key
    const safeDocId = (key: string) =>
      key
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 150);

    // Firestore document soft limit - leave a buffer from 1MB
    const FIRESTORE_DOC_LIMIT = 1024 * 1024; // 1,048,576
    const SAFE_LIMIT = FIRESTORE_DOC_LIMIT - 50 * 1024; // 50KB buffer

    // If present, try to include preprocessedBySection and preprocessedByTopic
    // directly, but fall back to moving them into subcollections if the size
    // becomes too large.
    let willStoreBySectionExternally = false;
    let willStoreByTopicExternally = false;

    if (payload.preprocessedBySection) {
      cleanedPayload.preprocessedBySection = removeUndefinedFields(
        payload.preprocessedBySection
      );
    }

    if (payload.preprocessedByTopic) {
      cleanedPayload.preprocessedByTopic = removeUndefinedFields(
        payload.preprocessedByTopic
      );
    }

    // If the main cleaned payload is already too large, move big pieces out.
    const mainSize = estimateSize(cleanedPayload);

    // Helper to write a set of items for a key into a subcollection, chunking
    // if necessary. Returns an array of doc ids written for that key.
    const writeChunksForKey = async (
      collectionName: string,
      key: string,
      items: SerializedProcessedNewsItem[]
    ): Promise<string[]> => {
      const ids: string[] = [];

      // Conservative chunking by item count to avoid huge documents.
      const CHUNK_SIZE = 100;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const docId = `${safeDocId(key)}${
          chunk.length < items.length ? `-${i}` : ""
        }`;
        const target = doc(db, SEND_COLLECTION, id, collectionName, docId);
        await setDoc(
          target,
          { items: removeUndefinedFields(chunk) },
          { merge: true }
        );
        ids.push(docId);
      }
      return ids;
    };

    // If cleaned payload is too big, externalize 'preprocessedBySection' first
    // (it's often the largest), then 'preprocessedByTopic' if still too big.
    if (mainSize > SAFE_LIMIT) {
      console.log(
        `[firestore] preprocessed payload estimate ${mainSize} bytes exceeds safe limit ${SAFE_LIMIT}, externalizing large fields`
      );

      if (payload.preprocessedBySection) {
        try {
          const sectionIndex: Record<
            string,
            { docIds: string[]; count: number }
          > = {};
          for (const [sectionKey, items] of Object.entries(
            payload.preprocessedBySection
          )) {
            const docIds = await writeChunksForKey(
              "preprocessedBySection",
              sectionKey,
              items
            );
            sectionIndex[sectionKey] = { docIds, count: items.length };
          }

          // Replace the heavy object with a small index referencing the subcollection
          cleanedPayload.preprocessedBySection =
            removeUndefinedFields(sectionIndex);
          willStoreBySectionExternally = true;
        } catch (err) {
          console.error("Error externalizing preprocessedBySection:", err);
        }
      }

      // Recalculate size
      if (
        estimateSize(cleanedPayload) > SAFE_LIMIT &&
        payload.preprocessedByTopic
      ) {
        try {
          const topicIndex: Record<
            string,
            { docIds: string[]; count: number }
          > = {};
          for (const [topicKey, items] of Object.entries(
            payload.preprocessedByTopic
          )) {
            const docIds = await writeChunksForKey(
              "preprocessedByTopic",
              topicKey,
              items
            );
            topicIndex[topicKey] = { docIds, count: items.length };
          }

          cleanedPayload.preprocessedByTopic =
            removeUndefinedFields(topicIndex);
          willStoreByTopicExternally = true;
        } catch (err) {
          console.error("Error externalizing preprocessedByTopic:", err);
        }
      }
    }

    // Final write to main document (small index only if externalized)
    await setDoc(ref, cleanedPayload, { merge: true });

    if (willStoreBySectionExternally) {
      console.log(
        "[firestore] Stored preprocessedBySection externally in subcollection"
      );
    }
    if (willStoreByTopicExternally) {
      console.log(
        "[firestore] Stored preprocessedByTopic externally in subcollection"
      );
    }
  } catch (error) {
    console.error("Error saving preprocessed data:", error);
    throw new Error("Failed to save preprocessed data");
  }
}

export async function saveNewsletterPlanStage(
  id: string,
  payload: {
    plan: GeminiNewsletterPlan;
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

    const update: Partial<NewsletterJob> & Record<string, unknown> = {
      plan: payload.plan,
      aiMetadata: payload.aiMetadata,
      summaryText: payload.summaryText,
      emailSubject: payload.emailSubject,
      planGeneratedAt: new Date(),
      status: remainingCount > 0 ? "ready-to-send" : "success",
      pendingRecipientsCount: remainingCount,
    };

    (update as Record<string, unknown>).error = deleteField();

    if (remainingCount === 0) {
      update.completedAt = new Date();
      update.pendingRecipients = [];
      (update as Record<string, unknown>).topics = deleteField();
      (update as Record<string, unknown>).formattedHtml = deleteField();
      (update as Record<string, unknown>).formattedText = deleteField();
      (update as Record<string, unknown>).formattedRawText = deleteField();
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
