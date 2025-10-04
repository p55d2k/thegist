#!/usr/bin/env node
"use strict";

const { setTimeout: sleep } = require("node:timers/promises");

const CONFIG = (() => {
  const requireEnv = (name) => {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value.trim();
  };

  const parseInteger = (name, fallback, { min, max } = {}) => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Environment variable ${name} must be a valid integer`);
    }
    if (typeof min === "number" && parsed < min) {
      return min;
    }
    if (typeof max === "number" && parsed > max) {
      return max;
    }
    return parsed;
  };

  const normalizeBaseUrl = (value) => {
    const trimmed = value.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new Error(
        `NEWSLETTER_API_BASE_URL must be an absolute URL (received: ${value})`
      );
    }
    return trimmed;
  };

  return {
    baseUrl: normalizeBaseUrl(requireEnv("NEWSLETTER_API_BASE_URL")),
    token: requireEnv("NEWSLETTER_JOB_TOKEN"),
    sendIdOverride: process.env.NEWSLETTER_SEND_ID?.trim() || null,
    requestTimeoutMs: parseInteger("NEWSLETTER_REQUEST_TIMEOUT_MS", 120_000, {
      min: 10_000,
      max: 300_000,
    }),
    maxAttempts: parseInteger("NEWSLETTER_REQUEST_RETRIES", 3, {
      min: 1,
      max: 10,
    }),
    newsSourcesPerRun: parseInteger("NEWSLETTER_SOURCES_PER_RUN", 10, {
      min: 1,
      max: 100,
    }),
    newsMaxRuns: parseInteger("NEWSLETTER_MAX_NEWS_RUNS", 80, {
      min: 1,
      max: 500,
    }),
    newsDelayMs: parseInteger("NEWSLETTER_NEWS_DELAY_MS", 5_000, {
      min: 0,
      max: 60_000,
    }),
    llmMaxRuns: parseInteger("NEWSLETTER_MAX_LLM_RUNS", 150, {
      min: 1,
      max: 600,
    }),
    llmDelayMs: parseInteger("NEWSLETTER_LLM_DELAY_MS", 5_000, {
      min: 0,
      max: 60_000,
    }),
    sendMaxRuns: parseInteger("NEWSLETTER_MAX_SEND_RUNS", 50, {
      min: 1,
      max: 300,
    }),
    sendDelayMs: parseInteger("NEWSLETTER_SEND_DELAY_MS", 5_000, {
      min: 0,
      max: 60_000,
    }),
    sendMaxBatches: parseInteger("NEWSLETTER_SEND_MAX_BATCHES", 10, {
      min: 1,
      max: 100,
    }),
    statusDelayMs: parseInteger("NEWSLETTER_STATUS_DELAY_MS", 3_000, {
      min: 0,
      max: 60_000,
    }),
  };
})();

const AUTH_HEADERS = {
  Authorization: `Bearer ${CONFIG.token}`,
};

const logger = {
  info: (message, data) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  },
  warn: (message, data) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.warn(`[${timestamp}] ${message}`, data);
    } else {
      console.warn(`[${timestamp}] ${message}`);
    }
  },
  error: (message, data) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.error(`[${timestamp}] ${message}`, data);
    } else {
      console.error(`[${timestamp}] ${message}`);
    }
  },
};

const wait = async (ms) => {
  if (ms <= 0) return;
  await sleep(ms);
};

const buildUrl = (path) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${CONFIG.baseUrl}/${path}`;
  }
  return `${CONFIG.baseUrl}${path}`;
};

const requestJson = async (path, options = {}) => {
  const {
    method = "GET",
    body,
    headers = {},
    expectJson = true,
    attempts = CONFIG.maxAttempts,
    timeoutMs = CONFIG.requestTimeoutMs,
  } = options;

  const url = buildUrl(path);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const status = response.status;
      const isRetryableStatus =
        status === 408 || status === 429 || status >= 500;

      let data = null;
      if (expectJson && status !== 204) {
        const text = await response.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            throw new Error(`Failed to parse JSON from ${url}: ${text}`);
          }
        }
      }

      if (!response.ok && isRetryableStatus && attempt < attempts) {
        const delay = Math.min(10_000, 500 * attempt);
        logger.warn(
          `Request to ${url} failed with status ${status}. Retrying after ${delay}ms (attempt ${attempt}/${attempts}).`
        );
        await wait(delay);
        continue;
      }

      return { status, ok: response.ok, data };
    } catch (error) {
      clearTimeout(timeoutId);
      const isAbort = error?.name === "AbortError";
      const retryable = isAbort || attempt < attempts;

      if (retryable) {
        const delay = Math.min(10_000, 500 * attempt);
        logger.warn(
          `Request to ${url} failed (${error.message}). Retrying after ${delay}ms (attempt ${attempt}/${attempts}).`
        );
        await wait(delay);
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Unable to complete request to ${url} after ${CONFIG.maxAttempts} attempts`
  );
};

const startNewsletterJob = async () => {
  if (CONFIG.sendIdOverride) {
    logger.info(
      `Using existing newsletter job ${CONFIG.sendIdOverride} (NEWSLETTER_SEND_ID provided).`
    );
    return {
      sendId: CONFIG.sendIdOverride,
      created: false,
    };
  }

  logger.info("Starting newsletter job…");

  const response = await requestJson("/api/start-newsletter", {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
    },
    body: JSON.stringify({}),
  });

  if (response.status === 200 && response.data?.sendId) {
    logger.info("Newsletter job started", {
      sendId: response.data.sendId,
      recipients: response.data.totalRecipients,
    });
    return { sendId: response.data.sendId, created: true };
  }

  if (response.status === 409 && response.data?.sendId) {
    logger.warn("Newsletter job already in progress. Resuming existing job.", {
      sendId: response.data.sendId,
      status: response.data.jobStatus,
    });
    return { sendId: response.data.sendId, created: false };
  }

  const errorMessage =
    response.data?.error || "Unknown error starting newsletter job";
  throw new Error(
    `Failed to start newsletter job: [${response.status}] ${errorMessage}`
  );
};

const collectNews = async () => {
  logger.info("Collecting news batches…");

  let completed = false;

  for (let run = 1; run <= CONFIG.newsMaxRuns; run += 1) {
    const url = `/api/news?persist=true&sources=${CONFIG.newsSourcesPerRun}`;
    const response = await requestJson(url, {
      method: "GET",
      headers: AUTH_HEADERS,
    });

    if (response.status === 204) {
      logger.info("News collection complete (204 received).");
      completed = true;
      break;
    }

    if (response.status === 409) {
      logger.warn(
        "News cursor conflict detected. Another worker advanced the job. Retrying soon."
      );
      await wait(CONFIG.newsDelayMs || 1000);
      continue;
    }

    if (!response.ok) {
      const error =
        response.data?.error || `Unexpected status ${response.status}`;
      throw new Error(`News collection failed: ${error}`);
    }

    const info = {
      message: response.data?.message,
      processedSources: response.data?.processedSources,
      remainingSources: response.data?.remainingSources,
      batchArticles: response.data?.batchArticles,
      totalArticles: response.data?.totalArticles,
      jobStatus: response.data?.jobStatus,
    };
    logger.info(`News run ${run}/${CONFIG.newsMaxRuns}`, info);

    if (response.data?.jobStatus === "news-ready") {
      logger.info("News collection reached ready state.");
      completed = true;
      break;
    }

    await wait(CONFIG.newsDelayMs);
  }

  if (!completed) {
    throw new Error(
      `Exceeded NEWSLETTER_MAX_NEWS_RUNS (${CONFIG.newsMaxRuns}) without completing news collection.`
    );
  }
};

const runLlmPlanning = async (sendId) => {
  logger.info("Running LLM planning…");

  for (let run = 1; run <= CONFIG.llmMaxRuns; run += 1) {
    const response = await requestJson("/api/llm", {
      method: "POST",
      headers: {
        ...AUTH_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sendId }),
    });

    if (response.status === 204) {
      logger.info("LLM endpoint reports no work remaining (204).");
      return;
    }

    if (!response.ok) {
      const error =
        response.data?.error || `Unexpected status ${response.status}`;
      throw new Error(`LLM planning failed: ${error}`);
    }

    const message = response.data?.message || "";
    const topic = response.data?.topic;

    logger.info(`LLM run ${run}/${CONFIG.llmMaxRuns}: ${message}`, {
      topic,
      articlesUsed: response.data?.articlesUsed,
      candidatesFetched: response.data?.candidatesFetched,
    });

    if (message.toLowerCase().includes("plan generated")) {
      logger.info("LLM planning completed successfully.");
      return;
    }

    if (message.toLowerCase().includes("already completed")) {
      logger.info("LLM planning already finished for this job.");
      return;
    }

    await wait(CONFIG.llmDelayMs);
  }

  throw new Error(
    `Exceeded NEWSLETTER_MAX_LLM_RUNS (${CONFIG.llmMaxRuns}) without completing LLM planning.`
  );
};

const sendNewsletterBatches = async (sendId) => {
  logger.info("Sending newsletter emails in batches…");

  let totalBatchesProcessed = 0;

  for (let run = 1; run <= CONFIG.sendMaxRuns; run += 1) {
    const response = await requestJson("/api/send-newsletter", {
      method: "POST",
      headers: {
        ...AUTH_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sendId, maxBatches: CONFIG.sendMaxBatches }),
    });

    if (response.status === 204) {
      logger.info(
        "Send endpoint returned 204 (no work). Assuming send complete."
      );
      break;
    }

    if (!response.ok) {
      const error =
        response.data?.error || `Unexpected status ${response.status}`;
      throw new Error(`Sending newsletter failed: ${error}`);
    }

    const remainingRecipients = response.data?.remainingRecipients ?? null;
    const batchesProcessed = response.data?.batchesProcessed ?? 0;
    totalBatchesProcessed += batchesProcessed;

    logger.info(`Send run ${run}/${CONFIG.sendMaxRuns}`, {
      message: response.data?.message,
      batchesProcessed,
      totalBatchesProcessed,
      remainingRecipients,
      totalRecipients: response.data?.totalRecipients,
    });

    if (
      response.data?.message?.toLowerCase().includes("completed") ||
      (typeof remainingRecipients === "number" && remainingRecipients <= 0)
    ) {
      logger.info("Newsletter sending completed.");
      return;
    }

    await wait(CONFIG.sendDelayMs);
  }

  if (totalBatchesProcessed === 0) {
    logger.warn(
      "No batches processed during send loop. Check job status manually."
    );
  } else {
    logger.warn(
      `Send loop ended after ${CONFIG.sendMaxRuns} runs. Remaining recipients may still be queued.`
    );
  }
};

const verifySendStatus = async (sendId) => {
  logger.info("Verifying newsletter status…");

  await wait(CONFIG.statusDelayMs);

  const response = await requestJson(
    `/api/status?id=${encodeURIComponent(sendId)}`
  );

  if (!response.ok) {
    const error =
      response.data?.error || `Unexpected status ${response.status}`;
    throw new Error(`Failed to verify newsletter status: ${error}`);
  }

  const status = response.data?.status;
  if (!status) {
    logger.warn(
      "Status endpoint did not return a status payload.",
      response.data
    );
    return;
  }

  logger.info("Status summary", {
    sendId: status.id,
    jobStatus: status.status,
    totalRecipients: status.totalRecipients,
    successfulRecipients: status.successfulRecipients,
    failedRecipients: status.failedRecipients,
    completedAt: status.completedAt,
  });

  if (status.status !== "success") {
    throw new Error(
      `Newsletter send did not complete successfully (status: ${status.status}).`
    );
  }
};

const main = async () => {
  const job = await startNewsletterJob();
  const sendId = job.sendId;

  await collectNews();
  await runLlmPlanning(sendId);
  await sendNewsletterBatches(sendId);
  await verifySendStatus(sendId);

  logger.info(`Newsletter automation workflow finished for ${sendId}.`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Newsletter automation failed", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
