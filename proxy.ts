/**
 * proxy.ts (f.d. middleware.ts — Next.js 16-konvention)
 * ─────────────────────────────────────────────────────────────────────────────
 * Clerk-baserat route-skydd för Athopia (publik webb).
 *
 * Beslut:
 * - Athopia-web har INGEN admin. All admin ligger i athopia-admin (os.athopia.se).
 * - Skyddade routes (/dashboard, /konto, /feed): kräver inloggning.
 * - /onboarding är öppet — gäster ska kunna välja lag utan konto (LAUNCH-05).
 * - WAITLIST_MODE: /sign-up stängs och pekas om till /vaenta. /sign-in är ORÖRD —
 *   den som redan blivit inbjuden måste kunna logga in. Inloggade som hamnar på
 *   /vaenta skickas till /mitt-lag, samma mönster som / redan använder.
 * - Allt annat är öppet (publik nyhetswebb).
 * - nanosport.se (huvuddomänen, ADR-001) visar BARA landningssidan. Inloggade skickas till
 *   appen på fotboll.nanosport.se, och varje annan väg — även /sign-in — 308:as dit, så att
 *   sessionen alltid skapas på samma värd som appen. Full inloggningsdetektering på
 *   huvuddomänen kräver Clerk-produktion på nanosport.se (cookie på hela domänen).
 *
 * clerkMiddleware() körs via Vercel Fluid Compute (Node.js runtime).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher, type ClerkMiddlewareAuth } from "@clerk/nextjs/server";
import { isWaitlistMode } from "@/lib/waitlist/mode";
import { HOME_SPORT_COOKIE, apexDestination, sportOfHost } from "@/lib/home-sport";

// Inloggning krävs
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/konto(.*)",
  "/feed(.*)",
  // Profil är en primär flik i bottenraden sedan navomläggningen. En utloggad
  // som trycker på den måste landa på inloggningen — samma 404-risk som
  // /konto hade innan `unauthenticatedUrl` sattes explicit nedan.
  "/profil(.*)",
]);

// Polsia 2.0 S2 — growth loop: capture utm_campaign i en cookie (30 dagar).
// Ingen DB-write här — bara attribution-läsning för /api/utm/visit och
// onboarding-flödet. Regex-validering görs igen på serversidan innan insert.
const UTM_CAMPAIGN_RE = /^[a-z0-9_-]{3,64}$/;

const isSignUpRoute = createRouteMatcher(["/sign-up(.*)"]);

const APEX_HOSTS = new Set(["nanosport.se", "www.nanosport.se"]);
/** Det landningssidan själv behöver på huvuddomänen. Statiska filer och /_next matchas aldrig av proxyn. */
const APEX_OWN = /^\/(?:$|api\/|monitoring)/;

/**
 * Hemsport (2026-10-01): varje sportsajt sätter cookien `nano_sport` på hela .nanosport.se.
 * nanosport.se läser den och skickar en inloggad användare till SIN sport — inte alltid fotboll.
 * Clerks kontoportal ska ha "efter inloggning" = https://nanosport.se, så blir huvuddomänen växeln.
 * Ingen cookie = landningssidans "Välj sport". Andra appar (TV) skickar egen redirect_url till Clerk.
 */
function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://fotboll.nanosport.se").replace(/\/$/, "");
}

export default clerkMiddleware(async (auth, req) => {
  const res = await route(auth, req);
  const sport = sportOfHost(req.nextUrl.hostname);
  if (sport && res && req.cookies.get(HOME_SPORT_COOKIE)?.value !== sport) {
    res.cookies.set(HOME_SPORT_COOKIE, sport, {
      domain: ".nanosport.se",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  }
  return res;
});

async function route(auth: ClerkMiddlewareAuth, req: NextRequest) {
  const waitlistMode = isWaitlistMode();

  if (APEX_HOSTS.has(req.nextUrl.hostname)) {
    const { pathname, search } = req.nextUrl;
    if (!APEX_OWN.test(pathname)) {
      return NextResponse.redirect(`${appOrigin()}${pathname}${search}`, 308);
    }
    if (pathname === "/") {
      const { userId } = await auth();
      const home = apexDestination(req.cookies.get(HOME_SPORT_COOKIE)?.value);
      if (userId && home) return NextResponse.redirect(home);
      // Inloggad utan hemsport: landningssidan med "Välj sport".
    }
  }

  if (waitlistMode && isSignUpRoute(req)) {
    return NextResponse.redirect(new URL("/vaenta", req.url));
  }

  if (req.nextUrl.pathname === "/vaenta") {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(new URL("/mitt-lag", req.url));
  }

  if (isProtectedRoute(req)) {
    // Explicit mål i stället för Clerks fallback. Utan `unauthenticatedUrl`
    // härleder Clerk sign-in-adressen ur miljövariabler, och i produktion —
    // där NEXT_PUBLIC_CLERK_SIGN_IN_URL saknades — gav den 404 i stället för
    // att skicka besökaren till inloggningen. En utloggad som klickade "Konto"
    // från /mer möttes alltså av en 404-sida. Lokalt syntes det aldrig,
    // eftersom .env.local har variabeln satt.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
    });
  }

  // LCP-fix: landningssidan (/) körde tidigare currentUser() i render-trädet
  // för att redirecta inloggade användare till /mitt-lag. Det tvingar Next
  // att behandla HELA routen som force-dynamic (ISR-cache populeras aldrig,
  // TTFB 1.5-2.2s på varje request — verifierat, se LCP-utredning). Flyttar
  // session-kollen hit (edge JWT, ingen nätverksrunda) så page.tsx blir
  // statisk/ISR-cachebar för alla utloggade besökare (majoriteten).
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (userId) {
      return NextResponse.redirect(new URL("/mitt-lag", req.url));
    }
  }

  const utmCampaign = req.nextUrl.searchParams.get("utm_campaign");
  if (utmCampaign && UTM_CAMPAIGN_RE.test(utmCampaign)) {
    const res = NextResponse.next();
    res.cookies.set("athopia_utm", utmCampaign, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Kör middleware på alla routes utom Next.js-interna + statiska filer
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
