import FadeInView from "@/components/animations/FadeInView";
import { FeatureCard } from "@/components/ui/Card";
import StaggerContainer, {
  StaggerItem,
} from "@/components/animations/StaggerContainer";

const features = [
  {
    title: "Cross-referenced, not AI-summaries",
    description:
      "We don't just summarize. We cross-check sources from left to right to international outlets so you get the full picture.",
    icon: "🔍",
    accent: "cyan" as const,
  },
  {
    title: "Signal over noise",
    description:
      "No engagement maximization. We filter for impact: What changed? Who's affected? Why should you care?",
    icon: "📊",
    accent: "pink" as const,
  },
  {
    title: "Everything is linked",
    description:
      "Don't take our word for it. Every claim links to the original source. Verify everything yourself.",
    icon: "🔗",
    accent: "green" as const,
  },
];

export default function Features() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <FadeInView>
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-sm uppercase tracking-[0.3em] text-indigo-200">
            How it works
          </span>
          <h2
            id="features-heading"
            className="mt-4 text-3xl font-semibold text-slate-50 sm:text-4xl"
          >
            Built for people who want context, not clickbait
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Every brief is fact-checked, source-linked, and written for understanding—not engagement.
          </p>
        </div>
      </FadeInView>

      <StaggerContainer className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <StaggerItem key={feature.title}>
            <FeatureCard
              title={feature.title}
              description={feature.description}
              icon={<span>{feature.icon}</span>}
              accent={feature.accent}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
