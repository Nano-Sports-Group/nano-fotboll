"use client";

import { vertical } from "@/lib/vertical";

import { useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown } from "lucide-react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { Container, Label, Reveal } from "./primitives";
import { AppStoreBadge } from "./AppStoreBadge";
import { getTeamAccent } from "@/lib/team-colors";
import { primaryCtaHref, primaryCtaLabel } from "@/lib/waitlist/mode";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";

/* Telefon-mockup är dekorativ (aria-hidden) och INTE LCP-elementet (det är h1
   ovan, statisk sen runda 2) — laddas som egen chunk efter hydrering av
   hero-texten så dess JS inte fördröjer FCP/TBT. Fast höjd/bredd matchar
   PhoneFrame för att undvika layout-skift när chunken landar. */
const PhoneMock = dynamic(() => import("./phone/PhoneMock"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[564px] w-[260px]" />,
});

export interface LandingHeroCopy {
  headlineAccent: string;
  body: string;
  ctaLabel?: string | null;
}

export interface HeroPulse {
  live: boolean;
  matchName: string | null;
  matchId: number | null;
  kickoff: string | null;
  leaderName: string | null;
  leaderPoints: number | null;
}

export interface ClubChip {
  slug: string;
  name: string;
  shortCode: string | null;
}

/** "Idag 15:00" / "Sön 14:00" — kompakt svensk avsparkstid. */
function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  if (today) return `Idag ${time}`;
  return `${d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Stockholm" })} ${time}`;
}

/** Levande sportpuls istället för statisk label — riktig data, aldrig påhittad. */
function PulseStrip({ pulse }: { pulse: HeroPulse }) {
  const hasMatch = !!pulse.matchName;
  const hasLeader = !!pulse.leaderName;
  if (!hasMatch && !hasLeader) return <Label>Allsvenskan · Live · AI-analys · Forum</Label>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {hasMatch && (
        <Link
          href={pulse.matchId ? `/match/${pulse.matchId}` : "/match"}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-white/85 transition-colors hover:border-pitch/50"
        >
          {pulse.live ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-pitch" />
          )}
          <span className="font-medium">{pulse.matchName}</span>
          <span className="text-white/55">
            {pulse.live ? "LIVE" : pulse.kickoff ? kickoffLabel(pulse.kickoff) : ""}
          </span>
        </Link>
      )}
      {hasLeader && (
        <Link href={`${vertical.leaguePath}/tabell`} className="text-white/55 transition-colors hover:text-white/75">
          Serieledare: <span className="text-white/80">{pulse.leaderName}</span> · {pulse.leaderPoints} p
        </Link>
      )}
    </div>
  );
}

export function Hero({
  pulse,
  clubs = [],
  copy,
  waitlistMode = false,
}: {
  pulse?: HeroPulse;
  clubs?: ClubChip[];
  copy?: LandingHeroCopy;
  /** WAITLIST_MODE läses på servern (app/page.tsx) — env finns inte i bundlen. */
  waitlistMode?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, -48]);

  const headlineAccent = copy?.headlineAccent ?? "Varje dag.";
  const body =
    copy?.body ??
    "Nyheter, rykten, siffror och snack om din klubb. Vi läser hundratals svenska källor varje dygn, sorterar bort bruset och sammanfattar det som betyder något. 60 sekunder om dagen, så vet du allt.";
  // Redaktionell copy vinner när den finns; annars styr läget etiketten.
  const ctaLabel = copy?.ctaLabel ?? primaryCtaLabel(waitlistMode);
  const ctaHref = primaryCtaHref(waitlistMode);
  const { setFavoriteTeam } = useFavoriteTeam();

  return (
    <section ref={ref} className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-40">
      {/* Arenan i kvällsljus som atmosfär, inte innehåll: nedtonad och övertonad mot svart
         så att rubrik och brödtext behåller full kontrast. alt="" = dekorativ. */}
      <Image
        src="/landing/hero-stadium-night.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover object-[50%_38%] opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -10%, rgba(45,83,73,0.14) 0%, transparent 70%)",
        }}
      />

      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
          {/* Copy */}
          <div className="max-w-[640px]">
            {/* LCP-element (rubrik) + intro renderas UTAN Reveal/motion —
               Reveal startar med opacity:0 + blur och väntar på JS-hydrering
               + IntersectionObserver innan paint, vilket försenade LCP till
               efter hydrering (uppmätt 9,1s). Statisk markup målas direkt. */}
            {pulse ? <PulseStrip pulse={pulse} /> : <Label>Allsvenskan · Live · AI-analys · Forum</Label>}

            <h1 className="mb-6 mt-4 font-heading text-[clamp(3.75rem,11vw,8.5rem)] leading-[0.92] tracking-display text-balance">
              Din klubb.
              <br />
              <span className="text-pitch-ink">{headlineAccent}</span>
            </h1>

            <p className="mb-8 max-w-[480px] text-[17px] leading-[1.6] text-white/75 md:mb-10 md:text-xl">
              {body}
            </p>

            <Reveal delay={0.24}>
              <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Link
                  href={ctaHref}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-pitch px-8 text-[17px] font-bold text-white transition-transform duration-100 ease-out hover:brightness-110 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {ctaLabel} <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#upplevelsen"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.04] px-8 text-[17px] text-white backdrop-blur-md transition-[transform,border-color] duration-100 ease-out hover:border-white/45 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  Se appen <ChevronDown className="h-4 w-4 text-white/50" />
                </a>
              </div>
              <AppStoreBadge className="-ml-3 -mt-5 mb-3" />
            </Reveal>

            {clubs.length > 0 ? (
              <Reveal delay={0.32}>
                <div className="flex flex-wrap gap-2" aria-label="Välj din klubb">
                  {clubs.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/lag/${c.slug}`}
                      onClick={() => {
                        void setFavoriteTeam(c.slug);
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 text-[13px] font-semibold text-white/75 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:text-white motion-reduce:hover:translate-y-0"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: getTeamAccent(c.slug) }}
                        aria-hidden
                      />
                      {c.name}
                    </Link>
                  ))}
                </div>
                <p className="mt-4 text-sm text-white/55">Alla 16 klubbar · Gratis att börja</p>
              </Reveal>
            ) : (
              <Reveal delay={0.32}>
                <p className="text-sm text-white/55">Hela Allsvenskan · Gratis att börja</p>
              </Reveal>
            )}
          </div>

          {/* Telefon med subtil parallax */}
          <Reveal delay={0.2} className="flex justify-center lg:justify-end">
            <motion.div style={reduced ? undefined : { y: phoneY }} className="relative">
              {/* Glöd bakom telefonen */}
              <div
                aria-hidden
                className="absolute -inset-12 rounded-full opacity-60 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, rgba(45,83,73,0.22) 0%, transparent 65%)",
                }}
              />
              <PhoneMock />
            </motion.div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
