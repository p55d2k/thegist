import EmailSubscribeForm from "@/components/forms/EmailSubscribeForm";
import FadeInView from "@/components/animations/FadeInView";

const highlights = [
  "5-minute read",
  "Cross-checked accuracy",
  "Cancel anytime",
];

export default function FinalCTA() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <FadeInView>
        <div className="rounded-3xl border border-indigo-500/40 bg-gradient-to-r from-indigo-600/20 via-violet-600/20 to-purple-600/20 p-10 text-center shadow-lg shadow-indigo-900/40">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200">
            Get started free
          </span>
          <h2
            id="cta-heading"
            className="mt-6 text-3xl font-semibold text-slate-50 sm:text-4xl"
          >
            Start getting The Gist now
          </h2>
          <p className="mt-4 text-lg text-indigo-50/80">
            Subscribe and you&apos;ll get the next brief immediately. No ads. No paywalls. 
            Just the news that actually matters.
          </p>

          <div className="mx-auto mt-8 max-w-xl">
            <EmailSubscribeForm />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-6 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-50/70">
            {highlights.map((highlight) => (
              <span key={highlight}>{highlight}</span>
            ))}
          </div>
        </div>
      </FadeInView>
    </div>
  );
}
