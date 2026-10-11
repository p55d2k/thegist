import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/70 p-6 shadow-lg shadow-black/10 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/30 hover:shadow-brand",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-white/0 to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

type FeatureCardAccent = "cyan" | "pink" | "green";

type FeatureCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  accent?: FeatureCardAccent;
  className?: string;
};

const accentMap: Record<FeatureCardAccent, string> = {
  cyan: "bg-gradient-to-br from-accent-cyan to-cyan-400",
  pink: "bg-gradient-to-br from-accent-pink to-pink-400",
  green: "bg-gradient-to-br from-accent-green to-emerald-400",
};

export function FeatureCard({
  icon,
  title,
  description,
  accent = "cyan",
  className,
}: FeatureCardProps) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/70 p-6 transition-all duration-500 hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-950/60",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800/30 via-slate-900/0 to-slate-900/30 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div
        className={cn(
          "mb-6 flex h-14 w-14 items-center justify-center rounded-xl text-2xl text-white shadow-lg shadow-black/20",
          accentMap[accent]
        )}
        role="img"
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="mb-3 text-xl font-semibold text-slate-50">{title}</h3>
      <p className="text-base leading-relaxed text-slate-300">{description}</p>
    </article>
  );
}
