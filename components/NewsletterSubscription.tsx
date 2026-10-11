"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiCpu } from "react-icons/fi";
import { EMAIL_REGEX } from "@/constants/config";

interface NewsletterSubscriptionProps {
  className?: string;
}

export default function NewsletterSubscription({
  className = "",
}: NewsletterSubscriptionProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error" | "exists">(
    "idle"
  );
  const [message, setMessage] = useState("");

  const trimmedEmail = email.trim();
  // Cheap client-side format check; the server runs the authoritative
  // validation (regex + external checks + rate limit) on submit.
  const emailValid = trimmedEmail ? EMAIL_REGEX.test(trimmedEmail) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          nickname: "",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.alreadyExists) {
          setStatus("exists");
          setMessage("You're already subscribed! 📧");
        } else {
          setStatus("success");
          setMessage("Welcome aboard! 🎉");
          setEmail("");
        }
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch (error) {
      setStatus("error");
      setMessage("Network error. Please check your connection.");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 4000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className={`relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/90 p-8 text-white shadow-[0_30px_120px_-45px_rgba(59,130,246,0.55)] backdrop-blur-xl ${className}`}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(147,51,234,0.1),transparent_50%)] opacity-50" />

      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mb-6"
        >
          <h3 className="text-xl sm:text-2xl font-bold mb-2 inline-flex items-center gap-2">
            <FiCpu />
            <span>Join The Gist</span>
          </h3>
          <p className="text-xs sm:text-sm leading-relaxed text-slate-200">
            Get the five-minute brief that tells you what actually matters.
            <br className="hidden sm:block" />
            <span className="block sm:inline font-semibold text-blue-200">
              AI reads 100+ sources • No clickbait • Cancel anytime
            </span>
          </p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="relative"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full rounded-xl border-2 border-white/10 bg-slate-900/60 px-5 py-3 text-center text-sm font-medium text-white placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300"
              disabled={isSubmitting}
              required
            />
            {/* Honeypot field */}
            <input
              type="text"
              name="nickname"
              style={{ display: "none" }}
              tabIndex={-1}
              autoComplete="off"
            />
            {email && emailValid === false && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-xs text-rose-300 text-center"
              >
                Please enter a valid email address
              </motion.p>
            )}
          </motion.div>

          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.9 }}
            whileHover={{
              scale: 1.02,
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)",
            }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isSubmitting || !email.trim() || emailValid !== true}
            className="w-full rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-white transition-all duration-300 hover:from-blue-400 hover:via-indigo-500 hover:to-purple-400 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 relative overflow-hidden"
          >
            <span className="relative z-10">
              {isSubmitting ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mx-auto h-5 w-5 rounded-full border-2 border-white border-t-transparent"
                />
              ) : (
                "Subscribe to The Gist"
              )}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 opacity-0 hover:opacity-100 transition-opacity duration-300" />
          </motion.button>
        </form>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mt-4 rounded-lg border p-3 text-center text-sm font-medium ${
              status === "success"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                : status === "exists"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                : "border-rose-400/40 bg-rose-500/10 text-rose-100"
            }`}
          >
            {message}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.1 }}
          className="mt-6 text-center"
        >
          <p className="text-[12px] sm:text-sm text-slate-300 leading-relaxed font-normal">
            Your email is safe with us. Unsubscribe anytime.
            <span className="mx-2 text-slate-500" aria-hidden>
              •
            </span>
            <Link
              href="/privacy"
              className="text-slate-300 hover:text-white no-underline transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded"
            >
              Privacy
            </Link>
            <span className="mx-2 text-slate-500" aria-hidden>
              •
            </span>
            <Link
              href="/terms"
              className="text-slate-300 hover:text-white no-underline transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded"
            >
              Terms
            </Link>
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
