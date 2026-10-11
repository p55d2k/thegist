import type { Metadata } from "next";
import Script from "next/script";
import { cn } from "@/lib/utils";
import { sans, display } from "@/lib/fonts";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Analytics from "@/components/Analytics";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thegist.zk.is-a.dev"),
  title: {
    default:
      "The Gist - 5-Minute AI News Brief for Students & Young Professionals",
    template: "%s | The Gist",
  },
  description:
    "Get the news that actually matters in 5 minutes. AI-curated brief from 100+ sources, delivered twice daily at 8am & 4pm UTC. No clickbait, no doom-scrolling. Free forever.",
  keywords: [
    "news summary",
    "daily news brief",
    "AI news",
    "news for students",
    "quick news",
    "news digest",
    "5 minute news",
    "teen news",
    "young adult news",
    "newsletter",
  ],
  authors: [{ name: "The Gist Team" }],
  creator: "p55d2k",
  publisher: "The Gist",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://thegist.zk.is-a.dev",
    title: "The Gist - 5-Minute AI News Brief",
    description:
      "News that actually matters in 5 minutes. AI reads 100+ sources so you don't have to.",
    siteName: "The Gist",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "The Gist - AI News Brief",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Gist - 5-Minute AI News Brief",
    description:
      "News that actually matters in 5 minutes. AI reads 100+ sources so you don't have to.",
    images: ["/twitter-card.png"],
    creator: "@thegistnews",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(sans.variable, display.variable)}
      suppressHydrationWarning
    >
      <head>
        <link rel="canonical" href="https://thegist.zk.is-a.dev/" />
        {process.env.NEXT_PUBLIC_GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
              `}
            </Script>
          </>
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "NewsMediaOrganization",
              name: "The Gist",
              url: "https://thegist.zk.is-a.dev",
              logo: "https://thegist.zk.is-a.dev/logo.svg",
              sameAs: [
                "https://github.com/p55d2k/thegist",
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "Customer Support",
                email: "hello@thegist.zk.is-a.dev",
              },
            }),
          }}
        />
      </head>
      <body className="relative min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[128px] animate-pulse" />
          <div
            className="absolute top-1/2 right-0 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[128px] animate-pulse"
            style={{ animationDelay: "1s" }}
          />
          <div
            className="absolute bottom-0 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-pink-600/10 blur-[128px] animate-pulse"
            style={{ animationDelay: "2s" }}
          />
        </div>
        <div className="pointer-events-none fixed inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)] opacity-20" />
        <Header />
        <main className="relative z-10 pt-16 md:pt-20">{children}</main>
        <Footer />
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
