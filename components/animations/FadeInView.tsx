"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";

type FadeInViewProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

export default function FadeInView({
  children,
  delay = 0,
  className = "",
}: FadeInViewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.8, delay, ease: [0.4, 0, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
