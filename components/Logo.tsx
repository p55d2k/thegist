"use client";

import Image from "next/image";
import React from "react";

type Props = {
  /** When true, use the dark variant (for light backgrounds). Default false. */
  dark?: boolean;
  className?: string;
};

export default function Logo({ dark = false, className = "" }: Props) {
  const src = dark ? "/logo-dark.svg" : "/logo.svg";
  return (
    <Image
      src={src}
      alt="The Gist logo"
      width={44}
      height={44}
      className={className}
      priority
    />
  );
}
