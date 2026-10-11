export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
