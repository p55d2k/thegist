"use client";

import { useState } from "react";
import { motion } from "framer-motion";

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
        body: JSON.stringify({ email: email.trim() }),
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

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className={`bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20 ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="text-center mb-6"
      >
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          📬 Join the Intelligence Brief
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed">
          Get handpicked commentaries delivered to your inbox twice daily.
          <br />
          <span className="font-semibold text-gray-700">
            Morning briefings • Evening analyses • Zero spam
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
            className="w-full px-4 py-3 text-gray-700 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 placeholder-gray-400 text-center font-medium"
            disabled={isSubmitting}
            required
          />
          {email && !isValidEmail(email) && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-500 text-xs mt-1 text-center"
            >
              Please enter a valid email address
            </motion.p>
          )}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isSubmitting || !email.trim() || !isValidEmail(email)}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3 px-6 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isSubmitting ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"
            />
          ) : (
            "Subscribe to Intelligence Brief ✨"
          )}
        </motion.button>
      </form>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`mt-4 p-3 rounded-lg text-center font-medium ${
            status === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : status === "exists"
              ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
              : "bg-red-100 text-red-800 border border-red-200"
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
        <p className="text-xs text-gray-500">
          🔒 Your email is safe with us. Unsubscribe anytime.
        </p>
      </motion.div>
    </motion.div>
  );
}
