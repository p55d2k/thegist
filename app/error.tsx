"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-3xl font-semibold text-slate-50">
          Something went wrong
        </h1>
        <p className="text-slate-400">
          The news is chaotic, but the site shouldn&apos;t be. Refresh or try
          again in a second.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
