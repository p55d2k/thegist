import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import {
  getNewsletterJob,
  getNextNewsletterJobForSending,
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
  FormattedArticles,
  computeTotalsFromPlan,
} from "@/lib/email";

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

const buildTransporter = async () => {
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

const sanitizeNodeMailerResponse = (info: nodemailer.SentMessageInfo) => {
  const clean: Record<string, unknown> = {};
  if (info.messageId) clean.messageId = info.messageId;
  if (info.accepted) clean.accepted = info.accepted;
  if (info.rejected) clean.rejected = info.rejected;
  if (info.pending) clean.pending = info.pending;
  if (info.response) clean.response = info.response;
  return clean;
};

export async function POST(request: NextRequest) {
  const authResponse = ensureAuthorized(request);
  if (authResponse) {
    return authResponse;
  }

  let payload: { sendId?: string; maxBatches?: number } = {};
  try {
    payload = (await request.json()) ?? {};
  } catch (error) {
    // treat missing body as empty payload
  }

  if (payload.sendId && typeof payload.sendId !== "string") {
    return NextResponse.json(
      { error: "sendId must be a string" },
      { status: 400 }
    );
  }

  let sendId = payload.sendId;
  let job = null as Awaited<ReturnType<typeof getNewsletterJob>>;

  if (sendId) {
    job = await getNewsletterJob(sendId);
    if (!job) {
      return NextResponse.json(
        { error: `Newsletter job ${sendId} not found` },
        { status: 404 }
      );
    }
  } else {
    const nextJob = await getNextNewsletterJobForSending();
    if (!nextJob) {
      return new NextResponse(null, { status: 204 });
    }
    sendId = nextJob.id;
    job = nextJob.job;
  }

  if (!job) {
    return NextResponse.json(
      { error: "Newsletter job not found" },
      { status: 404 }
    );
  }

  const pendingRecipients = [...(job.pendingRecipients ?? [])];

  if (pendingRecipients.length === 0) {
    return NextResponse.json(
      { message: "No recipients to process", sendId },
      { status: 200 }
    );
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
    return NextResponse.json(
      {
        error: "Newsletter job missing formatted content. Run /api/llm first.",
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

  const batchSize = Math.max(1, job.batchSize ?? DEFAULT_LIMITS.batchSize);

  const maxBatches = Number.isFinite(payload.maxBatches)
    ? Math.max(1, Number(payload.maxBatches))
    : DEFAULT_LIMITS.maxBatches;

  let transporter: nodemailer.Transporter | null = null;
  try {
    transporter = await buildTransporter();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create transporter",
      },
      { status: 500 }
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
        subject:
          job.emailSubject ??
          EMAIL_CONFIG.defaultSubject(new Date().toDateString()),
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

      return NextResponse.json({ error: message, sendId }, { status: 500 });
    }
  }

  const refreshedJob = await getNewsletterJob(sendId);
  const remaining = refreshedJob?.pendingRecipientsCount ?? 0;
  const completed = refreshedJob?.status === "success";

  return NextResponse.json(
    {
      message: completed ? "Newsletter send completed" : "Batch processed",
      sendId,
      batchesProcessed: processed,
      remainingRecipients: remaining,
      totalRecipients: refreshedJob?.totalRecipients ?? job.totalRecipients,
      successfulRecipients:
        refreshedJob?.successfulRecipients ?? job.successfulRecipients,
      failedRecipients: refreshedJob?.failedRecipients ?? job.failedRecipients,
      nodeMailerResponse: refreshedJob?.nodeMailerResponse ?? lastResponse,
    },
    { status: 200 }
  );
}
