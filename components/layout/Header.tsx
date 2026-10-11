"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Logo from "@/components/ui/Logo";

const links = [
  { href: "/how-it-works", label: "How it Works" },
  { href: "/email-preview", label: "Preview Brief" },
  { href: "/faq", label: "FAQ" },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-16 md:h-20 bg-slate-950/80 backdrop-blur-xl">
      <nav className="container mx-auto h-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-full items-center justify-between">
          <Logo />

          <div className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-300 transition-colors hover:text-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/#cta" className="inline-flex">
              <Button variant="primary" size="sm">
                Subscribe
              </Button>
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 text-slate-300 transition-colors hover:text-slate-50 md:hidden"
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-800/50 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="py-2 text-sm font-medium text-slate-300 transition-colors hover:text-slate-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/#cta" className="inline-flex w-full">
                <Button variant="primary" size="md" className="mt-2 w-full">
                  Subscribe
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
