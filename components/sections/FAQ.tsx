import Link from "next/link";
import type { ReactNode } from "react";
import FadeInView from "@/components/animations/FadeInView";

type FAQItem = {
  question: string;
  answer: ReactNode;
};

const faqs: FAQItem[] = [
  {
    question: "How is this different from Reddit or X?",
    answer:
      "Those platforms show you what's trending with other people. We show you what's actually impacting your life and why it matters. We cross-check sources and link everything so you can verify.",
  },
  {
    question: "Isn't this just ChatGPT summarizing news?",
    answer:
      "Not at all. We use AI to scan and cross-reference sources, but the analysis is our own. We compare outlets across the political spectrum, link to originals, and flag where sources disagree.",
  },
  {
    question: "What topics do you cover?",
    answer:
      "Politics, tech, business, climate, culture, science—anything that affects your life or comes up in conversations. No celebrity gossip unless it&apos;s genuinely newsworthy.",
  },
  {
    question: "Do I have to read every email?",
    answer:
      "Nope. Some days you'll read everything, some days you'll skim, some days you'll delete it. That's the point—it's there when you need it, not demanding your time.",
  },
  {
    question: "Will you sell my data?",
    answer: (
      <>
        Never. We&apos;re not in that business. Check our{" "}
        <Link
          href="/privacy"
          className="text-indigo-300 underline underline-offset-4 transition hover:text-indigo-100"
        >
          privacy policy
        </Link>{" "}
        for the full legal version.
      </>
    ),
  },
];

export default function FAQ() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <FadeInView>
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-sm uppercase tracking-[0.3em] text-indigo-200">
            FAQ
          </span>
          <h2
            id="faq-heading"
            className="mt-4 text-3xl font-semibold text-slate-50 sm:text-4xl"
          >
            Questions you&apos;re probably asking
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            We answer with evidence. Have a different question? Hit reply on any email and we&apos;ll respond.
          </p>
        </div>
      </FadeInView>

      <div className="mt-12 space-y-4">
        {faqs.map((faq) => (
          <FadeInView key={faq.question}>
            <details className="group rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 transition-all duration-300">
              <summary className="flex cursor-pointer items-center justify-between text-left text-lg font-semibold text-slate-50">
                {faq.question}
                <span className="ml-4 text-indigo-300 transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 text-base text-slate-300">{faq.answer}</p>
            </details>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
