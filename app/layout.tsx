import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { svSE } from "@clerk/localizations";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/CookieBanner";
import { UtmVisitTracker } from "@/components/growth/UtmVisitTracker";
import { LiquidGlassFilter } from "@/components/ux/LiquidGlassFilter";
import { getSiteUrl } from "@/lib/site-url";
import { getWebsiteSettings } from "@/lib/website-settings.server";
import { rootMetadataFromSettings } from "@/lib/website-settings";
import "./globals.css";
import { jsonLd } from "@/lib/json-ld";
import { vertical } from "@/lib/vertical";

const SITE = getSiteUrl();

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const SEO_KEYWORDS = vertical.seoKeywords;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getWebsiteSettings();
  // Smart App Banner i Safari — bara när appen finns i App Store (id per Vercel-projekt).
  const appStoreId = process.env.NEXT_PUBLIC_APP_STORE_ID?.trim();
  return {
    ...rootMetadataFromSettings(settings, SITE),
    keywords: [...SEO_KEYWORDS],
    ...(appStoreId ? { itunes: { appId: appStoreId } } : {}),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover → env(safe-area-inset-*) får värden på notch-enheter
  // (annars är GlassNav:s safe-area-padding en no-op).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
  ],
};

async function NewsMediaJsonLd() {
  const settings = await getWebsiteSettings();
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      name: settings.identity.siteName,
      url: SITE,
      foundingDate: "2026",
      contactPoint: { "@type": "ContactPoint", email: settings.identity.contactEmail, contactType: "editorial" },
      publishingPrinciples: `${SITE}/om-oss`,
      inLanguage: "sv",
    })}} />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkEnabled =
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_[A-Za-z0-9+/=]+$/);

  const content = (
    <html
      lang="sv"
      data-vertical={vertical.id}
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col">
        <LiquidGlassFilter />
        {/*
          WCAG 2.4.1 — hoppa förbi header/sidebar/bottendock till innehållet.
          Inte `hidden`: länken måste vara fokuserbar. Den parkeras ovanför
          viewporten och glider in först när den tabbas fram.
        */}
        <a
          href="#main"
          className="fixed left-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[200]
            -translate-y-[calc(100%+1.5rem)] rounded-xl bg-pitch px-5 py-3
            text-[15px] font-medium text-white shadow-lg transition-transform
            duration-150 ease-out focus:translate-y-0 focus:outline-2
            focus:outline-offset-2 focus:outline-white motion-reduce:transition-none"
        >
          Hoppa till innehåll
        </a>
        <NewsMediaJsonLd />
        <ThemeProvider>
          <Providers>
            {children}
            <Toaster position="bottom-right" richColors />
            <CookieBanner />
            <Suspense fallback={null}>
              <UtmVisitTracker />
            </Suspense>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return clerkEnabled ? <ClerkProvider localization={svSE as any} waitlistUrl="/vaenta">{content}</ClerkProvider> : content;
}
