"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    if (
      gaId &&
      typeof window !== "undefined" &&
      typeof window.gtag === "function"
    ) {
      window.gtag("config", gaId, {
        page_path: `${pathname}?${searchParams.toString()}`,
      });
    }
  }, [pathname, searchParams]);

  return null;
}
