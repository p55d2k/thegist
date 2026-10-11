import Link from "next/link";
import Logo from "@/components/ui/Logo";

const productLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/email-preview", label: "Preview Brief" },
  { href: "/faq", label: "FAQ" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  {
    href: "https://github.com/p55d2k/thegist",
    label: "GitHub",
    external: true,
  },
];

const footerBadges = ["5 minute read", "No clickbait", "Cancel anytime"];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800/50 bg-slate-950 py-12 md:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-12">
          <div className="md:col-span-2">
            <Logo className="mb-4" />
            <p className="mb-4 max-w-md text-slate-400">
              Made by people who think staying informed shouldn&apos;t suck.
            </p>
            <p className="text-sm text-slate-500">
              © {currentYear} p55d2k. All rights reserved.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-slate-200">Product</h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-slate-400 transition-colors hover:text-slate-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-slate-200">Legal</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-slate-200"
                    >
                      {link.label}
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M14 3a1 1 0 100 2h3.586l-7.293 7.293a1 1 0 101.414 1.414L19 6.414V10a1 1 0 102 0V4a1 1 0 00-1-1h-6z" />
                        <path d="M5 5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5a1 1 0 10-2 0v5H5V7h5a1 1 0 000-2H5z" />
                      </svg>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-slate-400 transition-colors hover:text-slate-200"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800/50 pt-8 sm:flex-row">
          <div className="flex items-center gap-4 text-xs uppercase tracking-wider text-slate-500">
            {footerBadges.map((badge, index) => (
              <span key={badge} className="flex items-center gap-4">
                {badge}
                {index < footerBadges.length - 1 && <span>•</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
