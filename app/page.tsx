"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import NewsletterSubscription from "@/components/NewsletterSubscription";

const Home = () => {
  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Background Image with enhanced styling */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/bg.jpg"
          alt="background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/10 to-slate-900/30"></div>
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {/* Animated floating elements */}
      <div className="absolute inset-0 -z-5">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/10 rounded-full"
            animate={{
              x: [0, 100, 0],
              y: [0, -100, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 1.5,
            }}
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + i * 10}%`,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6"
          >
            <motion.h1
              className="text-6xl md:text-7xl font-black text-white mb-4 tracking-tight"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                ZK
              </span>{" "}
              <span className="text-white">Newsletter</span>
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="space-y-4"
            >
              <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto leading-relaxed font-light">
                Your daily intelligence briefing delivering
                <span className="font-semibold text-blue-300">
                  {" "}
                  handpicked commentaries{" "}
                </span>
                from a curated mix of opinion feeds.
              </p>

              <div className="flex flex-wrap justify-center gap-4 text-sm md:text-base text-gray-300">
                <motion.span
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full"
                  whileHover={{ scale: 1.05 }}
                >
                  🌅 <span>Morning briefings</span>
                </motion.span>
                <motion.span
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full"
                  whileHover={{ scale: 1.05 }}
                >
                  🌆 <span>Evening analyses</span>
                </motion.span>
                <motion.span
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full"
                  whileHover={{ scale: 1.05 }}
                >
                  🌙 <span>Zero noise</span>
                </motion.span>
              </div>
            </motion.div>
          </motion.div>

          {/* Newsletter Subscription Component */}
          <div className="max-w-md mx-auto">
            <NewsletterSubscription />
          </div>

          {/* Stats and Social Proof */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="flex flex-wrap justify-center gap-8 text-white/80 text-sm"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-white">2x</div>
              <div>Daily delivery</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">5min</div>
              <div>Reading time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">0%</div>
              <div>Spam rate</div>
            </div>
          </motion.div>

          {/* Footer Links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.4 }}
            className="pt-8 space-y-4"
          >
            <Link
              href="https://github.com/p55d2k/zk-newsletter"
              target="_blank"
              className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors duration-200 text-lg font-medium group"
            >
              <motion.span
                whileHover={{ x: 5 }}
                className="transition-transform duration-200"
              >
                View Source Code on GitHub
              </motion.span>
              <motion.span
                whileHover={{ x: 3 }}
                className="transition-transform duration-200"
              >
                →
              </motion.span>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/30 to-transparent -z-5"></div>
    </div>
  );
};

export default Home;
