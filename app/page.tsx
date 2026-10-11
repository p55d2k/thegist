import type { Metadata } from "next";
import Hero from "@/components/sections/Hero";
import Features from "@/components/sections/Features";
import ExampleBrief from "@/components/sections/ExampleBrief";
import FAQ from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import Divider, { DecorativeDivider } from "@/components/ui/Divider";

export const metadata: Metadata = {
  title: "The Gist - News Brief Built for Critical Thinkers",
  description:
    "AI cross-references 100+ news sources daily. Get context, accuracy, and every link verified. 5 minutes. Twice daily. Free forever.",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "The Gist",
  url: "https://thegist.zk.is-a.dev",
  description: "AI-curated, cross-checked news brief delivered twice daily",
  applicationCategory: "NewsApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "127",
  },
  author: {
    "@type": "Organization",
    name: "The Gist",
    url: "https://thegist.zk.is-a.dev",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is The Gist free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, The Gist is completely free. We're building in public and experimenting. If we add a paid tier later, you'll hear it from us first.",
      },
    },
    {
      "@type": "Question",
      name: "How often do you send news briefs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We send two briefs daily at 8am UTC and 4pm UTC. Each takes about 5 minutes to read.",
      },
    },
    {
      "@type": "Question",
      name: "Can I trust AI-generated news summaries?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Our AI summarizes and cross-checks sources from 100+ outlets. We link to every original article so you can verify everything yourself.",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="flex flex-col gap-24 pb-24">
        <section id="hero" aria-labelledby="hero-heading">
          <Hero />
        </section>

        <DecorativeDivider icon="⚡" />

        <section id="how-it-works" aria-labelledby="features-heading">
          <Features />
        </section>

        <Divider />

        <section id="example" aria-labelledby="example-heading">
          <ExampleBrief />
        </section>

        <Divider />

        <section id="faq" aria-labelledby="faq-heading">
          <FAQ />
        </section>

        <DecorativeDivider icon="🚀" />

        <section id="cta" aria-labelledby="cta-heading">
          <FinalCTA />
        </section>
      </div>
    </>
  );
}
