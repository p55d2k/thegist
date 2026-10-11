import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

type LogoProps = {
  size?: LogoSize;
  className?: string;
};

const sizeMap: Record<
  LogoSize,
  { width: number; height: number; textSize: string }
> = {
  sm: { width: 32, height: 32, textSize: "text-base" },
  md: { width: 40, height: 40, textSize: "text-xl" },
  lg: { width: 56, height: 56, textSize: "text-2xl" },
};

export default function Logo({ size = "md", className }: LogoProps) {
  const { width, height, textSize } = sizeMap[size];

  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-3", className)}
    >
      <div className="relative overflow-hidden rounded-xl transition-all duration-300 group-hover:rotate-6 group-hover:scale-110 group-hover:shadow-glow">
        <Image
          src="/logo.svg"
          alt="The Gist logo"
          width={width}
          height={height}
          className="object-contain"
        />
      </div>
      <span
        className={cn(
          "hidden font-semibold text-slate-50 transition-colors duration-300 group-hover:text-white sm:inline",
          textSize
        )}
      >
        The Gist
      </span>
    </Link>
  );
}
