// Email sending pipeline: nodemailer transport and newsletter batch sends.
//
// Used by the single worker script, which drives the whole pipeline
// in-process.

import nodemailer from "nodemailer";

import {
  getNewsletterJob,
  markNewsletterJobAsSending,
  recordNewsletterSendBatch,
} from "@/lib/firestore";
import { EMAIL_CONFIG } from "@/constants/email";
import { DEFAULT_LIMITS } from "@/constants/config";
import {
  buildHtml,
  buildText,
  formatRawBody,
  formatBody,
  type FormattedArticles,
  computeTotalsFromPlan,
} from "@/lib/email";
import { getDateString, getTime } from "@/lib/date";

export class NewsletterSendError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NewsletterSendError";
    this.status = status;
  }
}

export const buildTransporter = async (): Promise<nodemailer.Transporter> => {
  if (!process.env.GOOGLE_USER_EMAIL || !process.env.GOOGLE_APP_PASSWORD) {
    throw new Error(
      "Missing email configuration: GOOGLE_USER_EMAIL or GOOGLE_APP_PASSWORD not set"
    );
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.smtp.host,
    port: EMAIL_CONFIG.smtp.port,
    secure: EMAIL_CONFIG.smtp.secure,
    auth: {
      user: process.env.GOOGLE_USER_EMAIL,
      pass: process.env.GOOGLE_APP_PASSWORD,
    },
  });

  await transporter.verify();
  return transporter;
};

export const sanitizeNodeMailerResponse = (
  info: nodemailer.SentMessageInfo
): Record<string, unknown> => {
  const clean: Record<string, unknown> = {};
  if (info.messageId) clean.messageId = info.messageId;
  if (info.accepted) clean.accepted = info.accepted;
  if (info.rejected) clean.rejected = info.rejected;
  if (info.pending) clean.pending = info.pending;
  if (info.response) clean.response = info.response;
  return clean;
};

export type NewsletterSendStepResult = {
  message: string;
  sendId: string;
  batchesProcessed: number;
  remainingRecipients: number;
  totalRecipients: number;
  successfulRecipients: number;
  failedRecipients: number;
  nodeMailerResponse?: Record<string, unknown>;
  completed: boolean;
};

/**
 * Send up to `maxBatches` batches for a job. Throws NewsletterSendError on
 * failure after recording the failed batch (marking the job failed).
 */
export async function sendNewsletterStep(
  sendId: string,
  opts: { maxBatches?: number } = {}
): Promise<NewsletterSendStepResult> {
  const job = await getNewsletterJob(sendId);
  if (!job) {
    throw new NewsletterSendError(
      404,
      `Newsletter job ${sendId} not found`
    );
  }

  const pendingRecipients = [...(job.pendingRecipients ?? [])];

  if (pendingRecipients.length === 0) {
    return {
      message: "No recipients to process",
      sendId,
      batchesProcessed: 0,
      remainingRecipients: 0,
      totalRecipients: job.totalRecipients,
      successfulRecipients: job.successfulRecipients,
      failedRecipients: job.failedRecipients,
      nodeMailerResponse: job.nodeMailerResponse,
      completed: job.status === "success",
    };
  }

  let formattedHtml = job.formattedHtml;
  let formattedRawText = job.formattedRawText;

  if (!formattedHtml && job.plan) {
    const { totalArticles, totalTopics, totalPublishers } =
      computeTotalsFromPlan(job.plan);
    const formatted: FormattedArticles = {
      plan: job.plan,
      html: "",
      text: "",
      totalTopics,
      totalArticles,
      totalPublishers,
      aiMetadata: job.aiMetadata || { model: "unknown", usedFallback: false },
    };
    formatted.html = buildHtml(formatted);
    formatted.text = buildText(formatted);
    formattedHtml = formatBody(formatted, sendId);
    formattedRawText = formatRawBody(formatted, sendId);
  }

  if (!formattedHtml || !formattedRawText) {
    throw new NewsletterSendError(
      400,
      "Newsletter job missing formatted content. Run scripts/send-newsletter.ts first."
    );
  }

  if (job.status === "success") {
    return {
      message: "Job already completed",
      sendId,
      batchesProcessed: 0,
      remainingRecipients: 0,
      totalRecipients: job.totalRecipients,
      successfulRecipients: job.successfulRecipients,
      failedRecipients: job.failedRecipients,
      nodeMailerResponse: job.nodeMailerResponse,
      completed: true,
    };
  }

  if (job.status === "sending") {
    return {
      message: "Job is currently being sent",
      sendId,
      batchesProcessed: 0,
      remainingRecipients: pendingRecipients.length,
      totalRecipients: job.totalRecipients,
      successfulRecipients: job.successfulRecipients,
      failedRecipients: job.failedRecipients,
      nodeMailerResponse: job.nodeMailerResponse,
      completed: false,
    };
  }

  const batchSize = Math.max(1, job.batchSize ?? DEFAULT_LIMITS.batchSize);
  const maxBatches = Number.isFinite(opts.maxBatches)
    ? Math.max(1, Number(opts.maxBatches))
    : DEFAULT_LIMITS.maxBatches;

  let transporter: nodemailer.Transporter | null = null;
  try {
    transporter = await buildTransporter();
  } catch (error) {
    throw new NewsletterSendError(
      500,
      error instanceof Error
        ? error.message
        : "Failed to create transporter"
    );
  }

  if (job.status === "ready-to-send") {
    await markNewsletterJobAsSending(sendId);
  }

  let processed = 0;
  let lastResponse: Record<string, unknown> | undefined;
  while (processed < maxBatches && pendingRecipients.length > 0) {
    const batchRecipients = pendingRecipients.splice(0, batchSize);
    if (batchRecipients.length === 0) {
      break;
    }

    try {
      const info = await transporter.sendMail({
        from: EMAIL_CONFIG.from(process.env.GOOGLE_USER_EMAIL!),
        to: process.env.GOOGLE_USER_EMAIL,
        bcc: batchRecipients.join(", "),
        subject: job.emailSubject ?? `${getDateString()} ${getTime()} Brief`,
        text: formattedRawText,
        html: formattedHtml,
      });

      const acceptedCount = Array.isArray(info.accepted)
        ? info.accepted.length
        : batchRecipients.length;
      const rejectedCount = Array.isArray(info.rejected)
        ? info.rejected.length
        : 0;

      lastResponse = sanitizeNodeMailerResponse(info);

      await recordNewsletterSendBatch(sendId, {
        sentEmails: batchRecipients,
        acceptedCount,
        rejectedCount,
        nodeMailerResponse: lastResponse,
      });

      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown send error";
      await recordNewsletterSendBatch(sendId, {
        sentEmails: batchRecipients,
        acceptedCount: 0,
        rejectedCount: batchRecipients.length,
        error: message,
        nodeMailerResponse: lastResponse,
      });

      throw new NewsletterSendError(500, message);
    }
  }

  const refreshedJob = await getNewsletterJob(sendId);
  const remaining = refreshedJob?.pendingRecipientsCount ?? 0;
  const completed = refreshedJob?.status === "success";

  return {
    message: completed ? "Newsletter send completed" : "Batch processed",
    sendId,
    batchesProcessed: processed,
    remainingRecipients: remaining,
    totalRecipients: refreshedJob?.totalRecipients ?? job.totalRecipients,
    successfulRecipients:
      refreshedJob?.successfulRecipients ?? job.successfulRecipients,
    failedRecipients: refreshedJob?.failedRecipients ?? job.failedRecipients,
    nodeMailerResponse: refreshedJob?.nodeMailerResponse ?? lastResponse,
    completed,
  };
}

/**
 * Send every remaining batch for a job. Used by the single worker script;
 * loops until the job is marked successful. Throws on a failed batch (the
 * failed batch recorder marks the job failed before the throw).
 */
export async function sendNewsletterToAllRecipients(
  sendId: string
): Promise<NewsletterSendStepResult> {
  let result = await sendNewsletterStep(sendId);
  let guard = 0;
  while (!result.completed && result.remainingRecipients > 0 && guard < 1000) {
    result = await sendNewsletterStep(sendId);
    guard += 1;
  }
  return result;
}