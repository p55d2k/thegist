import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="max-w-md space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200">
          404
        </span>
        <h1 className="text-3xl font-semibold text-slate-50">
          You found a future edition
        </h1>
        <p className="text-slate-400">
          This page doesn&apos;t exist yet. Maybe it will after the next news
          cycle. For now, head back to the brief.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
