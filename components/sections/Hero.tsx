import Link from "next/link";
import Button from "@/components/ui/Button";
import EmailSubscribeForm from "@/components/forms/EmailSubscribeForm";
import FadeInView from "@/components/animations/FadeInView";

const stats = [
  { label: "100+ sources", description: "Cross-checked daily for accuracy" },
  { label: "5 minutes", description: "Twice daily at 8am & 4pm UTC" },
  { label: "Free forever", description: "No ads, no paywalls, no BS" },
];

export default function Hero() {
  return (
    <div className="relative overflow-hidden pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[128px]" />
        <div
          className="absolute top-1/2 right-0 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-violet-600/20 blur-[128px]"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-[500px] w-[500px] translate-y-1/2 rounded-full bg-pink-600/10 blur-[128px]"
          style={{ animationDelay: "2s" }}
        />
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)] opacity-20" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <FadeInView>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200">
              News that moves the needle
            </span>
          </FadeInView>

          <FadeInView delay={0.1}>
            <h1
              id="hero-heading"
              className="mt-6 text-4xl font-bold text-slate-50 sm:text-5xl md:text-6xl lg:text-7xl"
            >
              The news brief for people who actually think.
            </h1>
          </FadeInView>

          <FadeInView delay={0.2}>
            <p className="mt-6 text-lg text-slate-300 sm:text-xl md:text-2xl">
              AI cross-references 100+ sources to give you the real story—not the algorithm&apos;s version. 
              Five minutes. Twice daily. Everything linked so you can go deeper when it matters.
            </p>
          </FadeInView>
        </div>

        <FadeInView delay={0.3} className="mx-auto mt-10 max-w-3xl">
          <EmailSubscribeForm />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1 text-sm text-slate-400">
            <span>Delivered at 8am & 4pm UTC.</span>
            <span>Free forever.</span>
            <span>Cancel anytime.</span>
          </div>
        </FadeInView>

        <FadeInView
          delay={0.35}
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/email-preview" className="inline-flex">
            <Button
              variant="secondary"
              size="md"
              className="flex items-center gap-2"
            >
              See today&apos;s brief
            </Button>
          </Link>
        </FadeInView>

        <FadeInView
          delay={0.4}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 text-center shadow-lg shadow-black/20"
            >
              <p className="text-xl font-semibold text-slate-50">
                {stat.label}
              </p>
              <p className="mt-2 text-sm text-slate-400">{stat.description}</p>
            </div>
          ))}
        </FadeInView>
      </div>
    </div>
  );
}
