/**
 * next.config.ts — Athopia Next.js-konfiguration
 *
 * images.remotePatterns: tillåter bilder från Supabase Storage och externa CDN:er.
 */

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { GOLF, HOCKEY } from "./lib/vertical";

const isHockey = process.env.NEXT_PUBLIC_VERTICAL === "hockey";
const isGolf = process.env.NEXT_PUBLIC_VERTICAL === "golf";
const leagueHome = isGolf ? "/golf" : isHockey ? "/shl" : "/allsvenskan";

const nextConfig: NextConfig = {
  // Turbopack root — fix för pnpm workspace med mehrere lockfiles
  turbopack: {
    root: __dirname,
  },
  // Permanenta alias för utgångna routes — ersätter de gamla page-filerna
  // som bara innehöll redirect() (audit 2026-07, T10).
  async redirects() {
    return [
      { source: "/priser", destination: "/prenumerera", permanent: true },
      { source: "/hem", destination: leagueHome, permanent: true },
      ...(isHockey
        ? [
            { source: "/allsvenskan", destination: "/shl", permanent: false },
            { source: "/allsvenskan/:path*", destination: "/shl/:path*", permanent: false },
            // Ytor utan hockeyinnehåll ännu (lib/vertical.ts → hiddenRoutes). Tillfälliga: tas bort när materialet finns.
            ...HOCKEY.hiddenRoutes.flatMap((route) => [
              { source: route, destination: "/shl", permanent: false },
              { source: `${route}/:path*`, destination: "/shl", permanent: false },
            ]),
          ]
        : []),
      // Golf har inga lag, matcher eller tabeller och säljer inget (lib/vertical.ts → GOLF.hiddenRoutes).
      // I fotboll och hockey finns ingen golfsida: /golf skickas hem (sidans notFound() ger 200 bakom loading.tsx).
      ...(isGolf
        ? GOLF.hiddenRoutes.flatMap((route) => [
            { source: route, destination: "/golf", permanent: false },
            { source: `${route}/:path*`, destination: "/golf", permanent: false },
          ])
        : [{ source: "/golf", destination: leagueHome, permanent: false }]),
      { source: "/sammanfattning", destination: "/mitt-lag", permanent: true },
      { source: "/feed", destination: "/mitt-lag", permanent: true },
      // Lagsektionerna bytte namn nar `?tab=` blev riktiga routes. Redirecten
      // ligger har och inte i en page.tsx: `permanentRedirect()` i en
      // sidkomponent gav status 200 med NEXT_REDIRECT i bodyn bakom proxy.ts
      // rewrite (verifierat mot prodbygge 2026-08-06) — routinglagret ger 308.
      {
        source: "/lag/:slug/podcasts",
        destination: "/lag/:slug/poddar",
        permanent: true,
      },
      {
        source: "/lag/:slug/sammanfattning",
        destination: "/lag/:slug/analys",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    if (!isHockey) return [];
    return [
      { source: "/shl", destination: "/allsvenskan" },
      { source: "/shl/:path*", destination: "/allsvenskan/:path*" },
    ];
  },
  experimental: {
    // Tree-shake barrel-exporter för att minska klientbundlen
    optimizePackageImports: ["lucide-react", "sonner", "@clerk/nextjs"],
  },
  images: {
    remotePatterns: [
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Externt CDN (lagbilder synkade via athopia-os)
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Sportmonks lag-/spelarbilder (teams.logo, players.image) — saknades
      // och kraschade varje sida som renderade en lagbild med 500 (next/image
      // "Invalid src prop", hittad live 2026-07-03 mot /allsvenskan och /match).
      {
        protocol: "https",
        hostname: "cdn.sportmonks.com",
      },
      // Clerk-avatarer (user.imageUrl → forum-inlägg, profilkort). Saknades och
      // gav hård 500 på varje /forum/[teamSlug] med ett inlägg som hade avatar —
      // samma klass av bugg som cdn.sportmonks.com ovan. Hittad 2026-08-03.
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

/**
 * Sentry wrappas BARA när source-map-upload är konfigurerat (org+projekt+token).
 * Saknas något → ren Next-config, så builden aldrig kan fela pga Sentry-pluginen.
 * Runtime-felrapportering (instrumentation*.ts) fungerar oavsett.
 */
const sentryReady =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

export default sentryReady
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
