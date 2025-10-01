// UI content constants for the home page
export const HOME_CONTENT = {
  hero: {
    badge: "AI READS IT • YOU GET THE GIST",
    title: "News for people who don't read the news.",
    description:
      "We scan dozens of sources every day and tells you what actually matters. No clickbait. No doom-scrolling. Just the important stuff in five minutes.",
  },

  howItWorks: [
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
        "One email by 7:30am. Read it with coffee, feel informed all day. Unsubscribe any time.",
    },
  ],

  whatYouGet: [
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
  ],

  honestAnswers: [
    {
      question: '"Is this actually unbiased?"',
      answer:
        "Nope. True objectivity doesn't exist. We pull from left, right, and international outlets so you see multiple angles on the same story.",
    },
    {
      question: '"Can I trust an AI?"',
      answer:
        "Think of it as your smart friend who reads everything. Our AI summarizes and cross-checks sources, and we link to every original article.",
    },
    {
      question: '"Why is this free?"',
      answer:
        "We're building in public. While we experiment, The Gist stays free. If we add a paid tier later, you'll hear it from us first.",
    },
  ],

  subscriberAvatars: [
    { initials: "AR", gradient: "from-blue-500 to-cyan-500" },
    { initials: "JM", gradient: "from-purple-500 to-indigo-500" },
    { initials: "SK", gradient: "from-emerald-500 to-teal-500" },
    { initials: "+", gradient: "from-slate-500 to-slate-600" },
  ],

  subscriberCount: "For people who want the gist, not the scroll",

  sections: {
    howItWorks: {
      title: "Honest, accessible, actually useful.",
      description:
        "The Gist is the five-minute newsletter for people who would rather live their lives than doom-scroll. Here's what the AI handles for you.",
    },
    whatYouGet: {
      title: "Get the gist in five minutes.",
      description:
        "Every brief answers three questions: what happened, why it matters, and what else should be on your radar. Everything is linked so you can go deeper when you want.",
    },
    honest: {
      title: "We don't pretend AI is magic.",
      description:
        "Staying informed shouldn't feel like homework. Here's how we keep it real about what the AI can (and can't) do.",
    },
    cta: {
      badge: "Be among the first to get The Gist",
      title: "Get tomorrow's brief—free, fast, no BS.",
      description:
        "Delivered by 7:30am every day of the week. Read it in five minutes, know what happened, and skip the doom-scroll. Unsubscribe any time.",
      features: ["5 minute read", "No clickbait", "Cancel anytime"],
    },
  },

  footer: {
    madeBy: "Made by people who think staying informed shouldn't suck.",
    copyright: (year: number) => `© ${year} p55d2k. All rights reserved.`,
  },

  links: {
    preview: "Preview our brief",
    seeBrief: "See a brief ↗",
  },
} as const;
