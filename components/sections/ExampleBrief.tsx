import Link from "next/link";
import FadeInView from "@/components/animations/FadeInView";

const process = [
  {
    step: "01",
    title: "AI scans 100+ sources",
    description: "Every morning and afternoon, our AI analyzes trusted outlets, niche sources, and expert commentary to find what's actually important.",
    icon: "🔍"
  },
  {
    step: "02",
    title: "Cross-check for accuracy",
    description: "We compare coverage across sources to identify consensus and spot where outlets differ. Context matters more than headlines.",
    icon: "✓"
  },
  {
    step: "03",
    title: "You get the gist",
    description: "Receive 3-5 essential stories with full context, quick hits on breaking news, and links to originals so you can verify everything.",
    icon: "📧"
  }
];

export default function ExampleBrief() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <FadeInView>
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-sm uppercase tracking-[0.3em] text-indigo-200">
            What you&apos;ll get
          </span>
          <h2
            id="example-heading"
            className="mt-4 text-3xl font-semibold text-slate-50 sm:text-4xl"
          >
            Stay informed without the overwhelm
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Every brief is built for understanding, not engagement. Context first, always.
          </p>
        </div>
      </FadeInView>

      <FadeInView delay={0.1}>
        <div className="mt-16 relative">
          {/* Timeline line - more prominent */}
          <div className="absolute left-6 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-600 via-indigo-500 to-indigo-400 shadow-lg shadow-indigo-500/20"></div>

          <div className="space-y-16">
            {process.map((step) => (
              <div
                key={step.step}
                className="relative flex items-center gap-8"
              >
                {/* Timeline dot */}
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 border-4 border-indigo-600 text-lg font-bold text-indigo-400 shadow-xl shadow-indigo-500/30">
                  {step.step}
                </div>

                {/* Content card - left-aligned */}
                <div className="flex-1 rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm transition-all duration-300 hover:shadow-indigo-500/10 hover:shadow-3xl hover:-translate-y-1 hover:border-indigo-500/30 text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{step.icon}</span>
                    <h3 className="text-2xl font-semibold text-slate-50">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeInView>

      <FadeInView delay={0.2} className="mt-16 text-center">
        <Link
          href="/email-preview"
          className="inline-flex items-center gap-2 rounded-full border-2 border-indigo-600 bg-indigo-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-300 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-105"
        >
          See today&apos;s real brief →
        </Link>
      </FadeInView>
    </div>
  );
}
