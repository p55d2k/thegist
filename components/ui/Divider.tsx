type DecorativeDividerProps = {
  icon?: string;
};

export default function Divider() {
  return (
    <div className="flex w-full items-center justify-center py-8">
      <div className="h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
    </div>
  );
}

export function DecorativeDivider({ icon = "✨" }: DecorativeDividerProps) {
  return (
    <div className="flex w-full items-center justify-center py-12">
      <div className="flex w-full max-w-4xl items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-700" />
        <span className="text-2xl" role="img" aria-hidden="true">
          {icon}
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-700" />
      </div>
    </div>
  );
}
