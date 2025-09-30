"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import NewsletterSubscription from "@/components/NewsletterSubscription";

const howItWorks = [
  {
    icon: "🤖",
    title: "AI does the reading",
    description:
      "Our AI skims major outlets, niche blogs, and everything in between so you don't have to.",
  },
  {
    icon: "✂️",
    title: "Cuts through the noise",
    description:
      "No doom-scroll, no filler. Just the stories that actually affect your day and why they matter.",
  },
  {
    icon: "📬",
    title: "Hits your inbox",
    description:
      "One email at 7:30am. Read it with coffee, feel informed all day. Unsubscribe any time.",
  },
];

const whatYouGet = [
  {
    label: "The day's top stories",
    value: "📰",
    detail:
      "3-5 headlines worth your attention, explained clearly without assuming you have a poli-sci degree.",
  },
  {
    label: "Why it matters",
    value: "🔍",
    detail:
      "Quick context on what changed, who it impacts, and why you should care in plain language.",
  },
  {
    label: "Quick hits",
    value: "⚡",
    detail:
      "Other stories worth knowing in bullet form. Skimmable in 30 seconds flat.",
  },
];

const honestAnswers = [
  {
    question: "“Is this actually unbiased?”",
    answer:
      "Nope. True objectivity doesn't exist. We pull from left, right, and international outlets so you see multiple angles on the same story.",
  },
  {
    question: "“Can I trust an AI?”",
    answer:
      "Think of it as your smart friend who reads everything. Our AI summarizes and cross-checks sources, and we link to every original article.",
  },
  {
    question: "“Why is this free?”",
    answer:
      "We're building in public. While we experiment, The Gist stays free. If we add a paid tier later, you'll hear it from us first.",
  },
];

const subscriberAvatars = [
  { initials: "AR", gradient: "from-blue-500 to-cyan-500" },
  { initials: "JM", gradient: "from-purple-500 to-indigo-500" },
  { initials: "SK", gradient: "from-emerald-500 to-teal-500" },
  { initials: "+4k", gradient: "from-slate-500 to-slate-600" },
];

const Home = () => {
  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-slate-950">
      <div className="absolute inset-0 -z-20">
        <Image
          src="/bg.jpg"
          alt="Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/60 via-blue-950/40 to-purple-950/60" />
      </div>

      <div className="absolute inset-0 -z-10 opacity-80">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              background:
                i % 2 === 0
                  ? "radial-gradient(circle at center, rgba(59,130,246,0.28), transparent 65%)"
                  : "radial-gradient(circle at center, rgba(168,85,247,0.25), transparent 60%)",
              width: `${180 + i * 20}px`,
              height: `${180 + i * 25}px`,
              left: `${(i * 13) % 100}%`,
              top: `${(i * 9) % 100}%`,
            }}
            animate={{
              x: [0, 12, -18, 6, 0],
              y: [0, -10, 14, -6, 0],
              opacity: [0.25, 0.45, 0.35, 0.4, 0.3],
            }}
            transition={{
              duration: 18 + i,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        <header className="px-6 md:px-10 pt-8">
          <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-lg"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-xl font-black text-white shadow-lg shadow-blue-500/40">
                TG
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.1em] text-slate-300">
                  The essential news brief
                </p>
                <p className="text-lg font-semibold text-white">The Gist</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
              <Link
                href="/email-preview"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-medium text-white transition hover:border-purple-400/60 hover:bg-purple-500/20"
              >
                <span>Preview today&apos;s brief</span>
                <span className="text-base">↗</span>
              </Link>
            </div>
          </motion.nav>
        </header>

        <main className="mx-auto flex max-w-6xl flex-col gap-24 px-6 pb-24 pt-16 md:px-10 lg:pt-20">
          <section className="space-y-12 lg:space-y-16">
            <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center lg:gap-16">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-8"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.4em] text-blue-200/90">
                  AI READS IT
                  <span className="h-1 w-1 rounded-full bg-blue-200/80" />
                  YOU GET THE GIST
                </div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl"
                >
                  News for people who don&apos;t read the news.
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                  className="max-w-xl text-lg leading-relaxed text-slate-200 sm:text-xl"
                >
                  Our AI reads 100+ sources every day and tells you what
                  actually matters. No clickbait. No doom-scrolling. Just the
                  important stuff in five minutes.
                </motion.p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative w-full max-w-lg justify-self-center md:justify-self-end"
              >
                <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-transparent blur-3xl" />
                <NewsletterSubscription />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-transparent p-8 backdrop-blur"
            >
              <div className="flex flex-col gap-8">
                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-[0.4em] text-slate-300">
                    How it works
                  </p>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Honest, accessible, actually useful.
                  </h2>
                  <p className="max-w-2xl text-base text-slate-200">
                    The Gist is the five-minute newsletter for people who would
                    rather live their lives than doom-scroll. Here&apos;s what
                    the AI handles for you.
                  </p>
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                  {howItWorks.map((item, index) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/40 to-slate-900/60 p-6 transition-all duration-300 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/10"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="relative">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-xl backdrop-blur">
                          {item.icon}
                        </div>
                        <h3 className="mb-3 text-lg font-bold text-white">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-300">
                          {item.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-300"
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {subscriberAvatars.map((avatar) => (
                    <span
                      key={avatar.initials}
                      className={`grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-gradient-to-br ${avatar.gradient} text-xs font-semibold text-white`}
                    >
                      {avatar.initials}
                    </span>
                  ))}
                </div>
                <span>4,200+ people skipping the doom-scroll</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-4 py-2 text-emerald-200">
                <span className="text-base">★</span>
                <span>Multi-perspective, source-linked every day</span>
              </div>
            </motion.div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-10">
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.4em] text-slate-300">
                  What you get
                </p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Get the gist in five minutes.
                </h2>
                <p className="max-w-2xl text-base text-slate-200">
                  Every brief answers three questions: what happened, why it
                  matters, and what else should be on your radar. Everything is
                  linked so you can go deeper when you want.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {whatYouGet.map((point, index) => (
                  <motion.div
                    key={point.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      duration: 0.6,
                      delay: index * 0.1,
                      ease: "easeOut",
                    }}
                    className="space-y-3 rounded-2xl border border-white/5 bg-slate-950/40 p-5 shadow-inner shadow-blue-500/10"
                  >
                    <span className="text-2xl">{point.value}</span>
                    <p className="text-base font-semibold tracking-wide text-white">
                      {point.label}
                    </p>
                    <p className="text-sm leading-relaxed text-slate-300">
                      {point.detail}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-950/40 to-indigo-900/40 p-8 backdrop-blur">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7 }}
              className="space-y-6"
            >
              <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
                The honest part
              </p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                We don&apos;t pretend AI is magic.
              </h2>
              <p className="max-w-2xl text-base text-slate-200">
                Staying informed shouldn&apos;t feel like homework. Here&apos;s
                how we keep it real about what the AI can (and can&apos;t) do.
              </p>
              <div className="space-y-5">
                {honestAnswers.map((item) => (
                  <div
                    key={item.question}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-100 shadow-inner shadow-blue-500/10"
                  >
                    <p className="mb-2 text-base font-semibold text-white">
                      {item.question}
                    </p>
                    <p className="text-sm text-slate-200">{item.answer}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/email-preview"
                className="inline-flex items-center gap-2 rounded-full border border-blue-400/50 bg-blue-500/10 px-6 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20"
              >
                See today&apos;s brief ↗
              </Link>
            </motion.div>
          </section>

          <section className="rounded-3xl border border-blue-500/30 bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 p-8 text-center backdrop-blur sm:p-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-50">
                Join 4,200+ who get the gist
              </p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Get tomorrow&apos;s brief—free, fast, no BS.
              </h2>
              <p className="mx-auto max-w-2xl text-base text-blue-50/90">
                Delivered at 7:30am every weekday. Read it in five minutes, know
                what happened, and skip the doom-scroll. Unsubscribe any time.
              </p>
              <div className="mx-auto max-w-lg">
                <NewsletterSubscription />
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-50/60">
                <span>5 minute read</span>
                <span>No clickbait</span>
                <span>Cancel anytime</span>
              </div>
            </motion.div>
          </section>

          <footer className="grid gap-6 text-sm text-slate-400 sm:grid-cols-2 sm:items-center">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white">
                TG
              </div>
              <div>
                <p className="text-white">
                  Made by people who think staying informed shouldn&apos;t suck.
                </p>
                <p className="text-slate-500">
                  © {new Date().getFullYear()} p55d2k. All rights reserved.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3 text-slate-400">
              <Link
                href="https://github.com/p55d2k/thegist"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:border-white/30 hover:text-white"
              >
                GitHub
                <span>↗</span>
              </Link>
              <Link
                href="mailto:zknewsletter@gmail.com"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:border-white/30 hover:text-white"
              >
                Contact
                <span>✉️</span>
              </Link>
            </div>
          </footer>
        </main>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
    </div>
  );
};

export default Home;
