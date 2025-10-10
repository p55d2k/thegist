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
        return "text-green-600 bg-green-50";
      case "failed":
        return "text-red-600 bg-red-50";
      case "pending":
        return "text-yellow-600 bg-yellow-50";
      case "news-collecting":
        return "text-amber-600 bg-amber-50";
      case "news-ready":
        return "text-blue-600 bg-blue-50";
      case "ready-to-send":
        return "text-indigo-600 bg-indigo-50";
      case "sending":
        return "text-purple-600 bg-purple-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <FiCheckCircle className="inline" />;
      case "failed":
        return <FiXCircle className="inline" />;
      case "pending":
        return <FiClock className="inline" />;
      case "news-collecting":
        return <FiTool className="inline" />;
      case "news-ready":
        return <FiFileText className="inline" />;
      case "ready-to-send":
        return <FiSend className="inline" />;
      case "sending":
        return <FiSend className="inline" />;
      default:
        return <FiHelpCircle className="inline" />;
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
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <button
        onClick={() => router.push("/")}
        className="mb-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200"
      >
        <FiArrowLeft className="text-base" />
        <span>Back</span>
      </button>
      <header className="space-y-4">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-semibold tracking-tight text-slate-900"
        >
          The Gist delivery status
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl text-sm leading-6 text-slate-600"
        >
          Keep tabs on what&apos;s been sent (or is about to be sent). Review
          recent newsletters and drill into specific send IDs when you need the
          details.
        </motion.p>

        {/* Search by ID */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-3 max-w-md"
        >
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Enter send ID to check status..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            onKeyPress={(e) => e.key === "Enter" && searchById()}
          />
          <button
            onClick={searchById}
            disabled={loading || !searchId.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Search
          </button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => fetchRecentSends({ showLoading: true })}
          disabled={loading}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Recent Sends"}
        </motion.button>
      </header>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <p className="text-red-800 text-sm">{error}</p>
        </motion.div>
      )}

      {/* Selected Status Details */}
      {selectedStatus && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-blue-50 border border-blue-200 rounded-lg space-y-4"
        >
          <h2 className="text-lg font-medium text-blue-900">
            Send Details: {selectedStatus.id}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-blue-700">
                <strong>Status:</strong>
                <span
                  className={`ml-2 px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    selectedStatus.status
                  )}`}
                >
                  {getStatusIcon(selectedStatus.status)}{" "}
                  {formatStatusLabel(selectedStatus.status)}
                </span>
              </p>
              <p className="text-sm text-blue-700">
                <strong>Started:</strong> {formatDate(selectedStatus.startedAt)}
              </p>
              {selectedStatus.completedAt && (
                <p className="text-sm text-blue-700">
                  <strong>Completed:</strong>{" "}
                  {formatDate(selectedStatus.completedAt)}
                </p>
              )}
              <p className="text-sm text-blue-700">
                <strong>Recipients:</strong> {selectedStatus.totalRecipients}
              </p>
              <p className="text-sm text-blue-700">
                <strong>Successful:</strong>{" "}
                {selectedStatus.successfulRecipients}
              </p>
              {selectedStatus.failedRecipients > 0 && (
                <p className="text-sm text-red-700">
                  <strong>Failed:</strong> {selectedStatus.failedRecipients}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-blue-700">
                <strong>Articles:</strong>{" "}
                {selectedStatus.articlesSummary.totalArticles}
              </p>
              <p className="text-sm text-blue-700">
                <strong>Topics:</strong>{" "}
                {selectedStatus.articlesSummary.totalTopics}
              </p>
              <p className="text-sm text-blue-700">
                <strong>Publishers:</strong>{" "}
                {selectedStatus.articlesSummary.totalPublishers}
              </p>
              {selectedStatus.nodeMailerResponse?.messageId && (
                <p className="text-sm text-blue-700">
                  <strong>Message ID:</strong>
                  <code className="ml-1 text-xs bg-blue-100 px-1 rounded">
                    {selectedStatus.nodeMailerResponse.messageId}
                  </code>
                </p>
              )}
              {selectedStatus.error && (
                <p className="text-sm text-red-700">
                  <strong>Error:</strong> {selectedStatus.error}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent Sends */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-4"
      >
        <h2 className="text-xl font-medium text-slate-900">
          Recent Email Sends
        </h2>

        {loading && recentSends.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">
              Loading recent sends...
            </p>
          </div>
        ) : recentSends.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No recent email sends found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSends.map((send, index) => (
              <motion.div
                key={send.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedStatus(send)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {send.id}
                      </code>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                          send.status
                        )}`}
                      >
                        {getStatusIcon(send.status)}{" "}
                        {formatStatusLabel(send.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Started: {formatDate(send.startedAt)}
                    </p>
                    {send.completedAt && (
                      <p className="text-sm text-gray-600">
                        Completed: {formatDate(send.completedAt)}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <p>{send.totalRecipients} recipients</p>
                    <p>{send.articlesSummary.totalArticles} articles</p>
                    {send.error && (
                      <p className="text-red-600 text-xs mt-1 max-w-xs truncate">
                        {send.error}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </main>
  );
}
