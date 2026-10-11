#!/usr/bin/env bun
// Single in-process newsletter pipeline worker.
//
// Runs the full pipeline end-to-end against Firestore (via firebase-admin):
//   start/resume job -> collect news -> LLM plan -> send every batch.
//
// Requirements (env):
//   FIREBASE_SERVICE_ACCOUNT (JSON) | FIREBASE_SERVICE_ACCOUNT_PATH
//   GROQ_API_KEY
//   GOOGLE_USER_EMAIL + GOOGLE_APP_PASSWORD (only needed for the send stage)
//
// Optional:
//   NEWSLETTER_SEND_ID  resume an existing job at whatever stage it is in

import { getNewsletterJob } from "@/lib/firestore";
import { startNewsletterJob, collectNewsForJob } from "@/lib/news";
import {
  completeLLMPlanning,
  LLMTopicProcessingError,
} from "@/lib/llm-planning";
import {
  sendNewsletterToAllRecipients,
  NewsletterSendError,
} from "@/lib/email-send";

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const log = (message: string, extra?: Record<string, unknown>) => {
  const prefix = new Date().toISOString();
  if (extra) {
    console.log(
      `[${prefix}] ${message} ${Object.entries(extra)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ")}`
    );
  } else {
    console.log(`[${prefix}] ${message}`);
  }
};

const fail = (message: string, extra?: Record<string, unknown>) => {
  const prefix = new Date().toISOString();
  console.error(`[${prefix}] ${message} ${JSON.stringify(extra ?? {})}`);
  process.exitCode = 1;
};

const isTransient = (error: unknown): boolean => {
  if (error instanceof LLMTopicProcessingError) {
    return TRANSIENT_STATUSES.has(error.status);
  }
  if (error instanceof NewsletterSendError) {
    return TRANSIENT_STATUSES.has(error.status);
  }
  return false;
};

const withTransientRetry = async <T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransient(error) || attempt >= attempts) {
        throw error;
      }
      const delayMs = 1000 * attempt;
      log(
        `${label} failed transiently (${(error as Error).message}); retrying in ${delayMs}ms (attempt ${attempt}/${attempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} retry loop exhausted`);
};

const main = async (): Promise<void> => {
  const sendIdOverride = process.env.NEWSLETTER_SEND_ID?.trim();

  // Stage 1: start or resume a job
  let sendId: string;
  if (sendIdOverride) {
    sendId = sendIdOverride;
    log(`Resuming existing newsletter job ${sendId} (NEWSLETTER_SEND_ID)`);
  } else {
    const started = await startNewsletterJob();
    sendId = started.sendId;
    log(
      started.resumed
        ? `Resumed interrupted collection job ${sendId}`
        : `Started newsletter job ${sendId} with ${started.totalRecipients} recipients`
    );
  }

  // Stage 2: collect news until the job is news-ready
  const initialJob = await getNewsletterJob(sendId);
  if (!initialJob) {
    fail(`Newsletter job ${sendId} not found`);
    return;
  }
  if (initialJob.status === "failed") {
    fail(`Newsletter job ${sendId} is in failed state`, {
      error: initialJob.error ?? "unknown",
    });
    return;
  }
  if (initialJob.status === "sending") {
    fail(
      `Newsletter job ${sendId} is stuck mid-send (status: sending). Resume is not safe; reset the job manually.`
    );
    return;
  }

  if (initialJob.status === "news-collecting") {
    log("Collecting news...");
    const newsResult = await collectNewsForJob();
    log("News collection complete", {
      sendId: newsResult.sendId,
      totalArticles: newsResult.totalArticles,
      sourcesProcessed: newsResult.sourcesProcessed,
    });
  }

  // Stage 3: LLM planning (retry transient Groq failures)
  const afterNews = await getNewsletterJob(sendId);
  if (afterNews?.status === "news-ready") {
    log("Planning newsletter with LLM...");
    const planResult = await withTransientRetry(
      "LLM planning",
      () => completeLLMPlanning(sendId),
      3
    );
    log("LLM planning complete", {
      step: planResult.step,
      totalTopics: planResult.totalTopics,
      totalArticles: planResult.totalArticles,
      totalPublishers: planResult.totalPublishers,
    });
  }

  // Stage 4: send every remaining batch
  const afterPlan = await getNewsletterJob(sendId);
  if (afterPlan?.status === "ready-to-send") {
    log("Sending newsletter...");
    const sendResult = await sendNewsletterToAllRecipients(sendId);
    log("Newsletter send finished", {
      batchesProcessed: sendResult.batchesProcessed,
      totalRecipients: sendResult.totalRecipients,
      successfulRecipients: sendResult.successfulRecipients,
      failedRecipients: sendResult.failedRecipients,
      completed: sendResult.completed,
    });
  }

  // Stage 5: verify final state
  const finalJob = await getNewsletterJob(sendId);
  if (!finalJob) {
    fail(`Newsletter job ${sendId} disappeared during pipeline`);
    return;
  }
  if (finalJob.status === "success") {
    log(`Newsletter pipeline succeeded for job ${sendId}`, {
      totalRecipients: finalJob.totalRecipients,
      successfulRecipients: finalJob.successfulRecipients,
      failedRecipients: finalJob.failedRecipients,
    });
    return;
  }
  if (finalJob.status === "sending") {
    fail(`Newsletter job ${sendId} ended mid-send`, {
      pending: finalJob.pendingRecipientsCount,
    });
    return;
  }
  fail(`Newsletter pipeline ended in state ${finalJob.status}`, {
    error: finalJob.error ?? "unknown",
  });
};

main().catch((error) => {
  fail("Newsletter pipeline failed", {
    error: error instanceof Error ? error.message : String(error),
  });
});