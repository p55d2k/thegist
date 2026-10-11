"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiTool,
  FiFileText,
  FiSend,
  FiHelpCircle,
  FiArrowLeft,
  FiRefreshCw,
} from "react-icons/fi";

interface EmailSendStatus {
  id: string;
  startedAt: string;
  completedAt?: string;
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
  nodeMailerResponse?: any;
  error?: string;
  articlesSummary: {
    totalArticles: number;
    totalTopics: number;
    totalPublishers: number;
  };
}

interface StatusResponse {
  status?: EmailSendStatus;
  recentSends?: EmailSendStatus[];
  count?: number;
  error?: string;
}

export default function StatusPage() {
  const router = useRouter();
  const [recentSends, setRecentSends] = useState<EmailSendStatus[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<EmailSendStatus | null>(
    null
  );
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasPendingSends, setHasPendingSends] = useState(false);

  const fetchRecentSends = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? false;

      if (showLoading) {
        setLoading(true);
      }

      try {
        const response = await fetch("/api/status");
        const data: StatusResponse = await response.json();

        if (data.error) {
          setError(data.error);
          setHasPendingSends(false);
        } else if (data.recentSends) {
          setRecentSends(data.recentSends);
          setError("");

          const pending = data.recentSends.some(
            (send) => send.status !== "success" && send.status !== "failed"
          );
          setHasPendingSends(pending);
        } else {
          setHasPendingSends(false);
        }
      } catch (err) {
        setError("Failed to fetch recent sends");
        setHasPendingSends(false);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const searchById = async () => {
    if (!searchId.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/status?id=${encodeURIComponent(searchId.trim())}`
      );
      const data: StatusResponse = await response.json();

      if (data.error) {
        setError(data.error);
        setSelectedStatus(null);
      } else if (data.status) {
        setSelectedStatus(data.status);
        setError("");
      }
    } catch (err) {
      setError("Failed to fetch status");
      setSelectedStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";

    // Use the browser's locale (undefined) so times are shown in the
    // user's local timezone. Include a short timezone name so it's clear
    // what timezone the timestamp is displayed in.
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZoneName: "short",
      }).format(new Date(dateString));
    } catch (err) {
      // Fallback to basic ISO string if formatting fails
      return new Date(dateString).toString();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "failed":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "news-collecting":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "news-ready":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "ready-to-send":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "sending":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <FiCheckCircle className="inline w-4 h-4" />;
      case "failed":
        return <FiXCircle className="inline w-4 h-4" />;
      case "pending":
        return <FiClock className="inline w-4 h-4" />;
      case "news-collecting":
        return <FiTool className="inline w-4 h-4" />;
      case "news-ready":
        return <FiFileText className="inline w-4 h-4" />;
      case "ready-to-send":
        return <FiSend className="inline w-4 h-4" />;
      case "sending":
        return <FiSend className="inline w-4 h-4" />;
      default:
        return <FiHelpCircle className="inline w-4 h-4" />;
    }
  };

  const formatStatusLabel = (status: EmailSendStatus["status"]): string =>
    status
      .split("-")
      .map((segment) => segment.toUpperCase())
      .join(" ");

  useEffect(() => {
    void fetchRecentSends({ showLoading: true });
  }, [fetchRecentSends]);

  useEffect(() => {
    if (!hasPendingSends) {
      return;
    }

    const interval = setInterval(() => {
      void fetchRecentSends();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchRecentSends, hasPendingSends]);

  return (
    <div className="container mx-auto max-w-6xl px-6 pb-24 pt-8">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/70 pt-12 px-10 pb-10 shadow-[0_40px_120px_-60px_rgba(79,70,229,0.8)] backdrop-blur-xl"
      >
        <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/30 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-violet-500/20 blur-[120px]" />

        <div className="relative z-10 space-y-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-slate-700 hover:text-white"
            >
              <FiArrowLeft className="h-4 w-4" />
              <span>Back to home</span>
            </button>

            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              onClick={() => fetchRecentSends({ showLoading: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiRefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </motion.button>
          </div>

          <header className="space-y-6">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold tracking-tight text-slate-50"
            >
              Delivery status dashboard
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="max-w-2xl text-lg leading-7 text-slate-300"
            >
              Monitor newsletter delivery, check live send progress, and drill
              into recent sends whenever something looks off.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <div className="flex w-full flex-1 items-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 px-4 py-3">
                <input
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="Search by send ID..."
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && searchById()}
                  aria-label="Search delivery status by send ID"
                />
              </div>
              <button
                onClick={searchById}
                disabled={loading || !searchId.trim()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:from-indigo-400 hover:to-violet-500 hover:shadow-lg hover:shadow-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Search
              </button>
            </motion.div>
          </header>

          {error ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300"
            >
              {error}
            </motion.div>
          ) : null}

          {selectedStatus ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-8"
            >
              <h2 className="text-2xl font-semibold text-slate-50">
                Send details
              </h2>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-300">
                      Status
                    </span>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(
                        selectedStatus.status
                      )}`}
                    >
                      {getStatusIcon(selectedStatus.status)}
                      {formatStatusLabel(selectedStatus.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">Started:</span>{" "}
                    {formatDate(selectedStatus.startedAt)}
                  </p>
                  {selectedStatus.completedAt ? (
                    <p className="text-sm text-slate-300">
                      <span className="font-medium text-slate-200">
                        Completed:
                      </span>{" "}
                      {formatDate(selectedStatus.completedAt)}
                    </p>
                  ) : null}
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">
                      Recipients:
                    </span>{" "}
                    {selectedStatus.totalRecipients}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">
                      Successful:
                    </span>{" "}
                    {selectedStatus.successfulRecipients}
                  </p>
                  {selectedStatus.failedRecipients > 0 ? (
                    <p className="text-sm text-pink-300">
                      <span className="font-medium text-pink-200">Failed:</span>{" "}
                      {selectedStatus.failedRecipients}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">
                      Articles:
                    </span>{" "}
                    {selectedStatus.articlesSummary.totalArticles}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">Topics:</span>{" "}
                    {selectedStatus.articlesSummary.totalTopics}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-slate-200">
                      Publishers:
                    </span>{" "}
                    {selectedStatus.articlesSummary.totalPublishers}
                  </p>
                  {selectedStatus.nodeMailerResponse?.messageId ? (
                    <p className="text-sm text-slate-300">
                      <span className="font-medium text-slate-200">
                        Message ID:
                      </span>
                      <code className="ml-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-200">
                        {selectedStatus.nodeMailerResponse.messageId}
                      </code>
                    </p>
                  ) : null}
                  {selectedStatus.error ? (
                    <p className="text-sm text-pink-300">
                      <span className="font-medium text-pink-200">Error:</span>{" "}
                      {selectedStatus.error}
                    </p>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-semibold text-slate-50">
                Recent sends
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Tap a send to reveal the full delivery breakdown.
              </p>
            </div>

            {loading && recentSends.length === 0 ? (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-12 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-400" />
                <p className="mt-4 text-sm text-slate-400">
                  Loading recent sends...
                </p>
              </div>
            ) : recentSends.length === 0 ? (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-12 text-center text-sm text-slate-400">
                No recent sends just yet. Check back after the next dispatch.
              </div>
            ) : (
              <div className="grid gap-4">
                {recentSends.map((send, index) => (
                  <motion.button
                    key={send.id}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index }}
                    onClick={() => setSelectedStatus(send)}
                    className="group flex w-full flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-6 text-left transition-all duration-200 hover:border-indigo-500/60 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-indigo-900/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <code className="rounded-lg bg-slate-900/80 px-3 py-1 text-sm text-slate-200">
                        {send.id}
                      </code>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(
                          send.status
                        )}`}
                      >
                        {getStatusIcon(send.status)}
                        {formatStatusLabel(send.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                      <div className="space-y-1">
                        <p>Started: {formatDate(send.startedAt)}</p>
                        {send.completedAt ? (
                          <p>Completed: {formatDate(send.completedAt)}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p>{send.totalRecipients} recipients</p>
                        <p>{send.articlesSummary.totalArticles} articles</p>
                      </div>
                    </div>
                    {send.error ? (
                      <p className="text-xs text-pink-300">{send.error}</p>
                    ) : null}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
