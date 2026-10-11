import FadeInView from "@/components/animations/FadeInView";

const testimonials = [
  {
    quote:
      "Finally, a news source that doesn't assume I have 3 hours to scroll through articles.",
    name: "Maya, 19",
    role: "College student",
  },
  {
    quote: "I actually know what's happening now. Wild concept.",
    name: "Jordan, 22",
    role: "First job out of college",
  },
  {
    quote:
      "My group chat thinks I'm a news genius. Little do they know...",
    name: "Alex, 17",
    role: "High school senior",
  },
];

export default function SocialProof() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <FadeInView>
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-sm uppercase tracking-[0.3em] text-indigo-200">
            Real readers
          </span>
          <h2
            id="testimonials-heading"
            className="mt-4 text-3xl font-semibold text-slate-50 sm:text-4xl"
          >
            Real takes from real readers
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Youth trust youth. These are pulled straight from our inbox, DMs,
            and late-night texts.
          </p>
        </div>
      </FadeInView>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <FadeInView key={testimonial.name}>
            <div className="h-full rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 text-left">
              <p className="text-lg text-slate-200">“{testimonial.quote}”</p>
              <div className="mt-6">
                <p className="font-semibold text-slate-50">
                  {testimonial.name}
                </p>
                <p className="text-sm text-slate-400">{testimonial.role}</p>
              </div>
            </div>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
