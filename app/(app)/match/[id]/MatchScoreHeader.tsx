"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";

// 60fps x-nfl-game-pull-down-text-logo-morph-interaction (nano-components/patterns/
// matchsida-statistik/README.md §2a.2): resultat-headern komprimeras mot toppen när
// man scrollar förbi, och en kompakt sticky rad tar över — samma mönster som nano-ios
// MatchHeaderMorph/nano-android ScoreBanner-kollapsen, portat till scrollY i stället
// för drag eftersom web inte har en motsvarande drag-yta ovanför en lista.
// Ambient-glowen crossfadar till lagets riktiga färg (60fps x-nfl-games-tab-switch,
// samma TeamColors-källa som lag-hub/matchkort redan använder) i stället för en
// matchläges-färg — riktig lagidentitet, ingen ny infra.

interface MatchScoreHeaderProps {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  statusText: string;
  isLive: boolean;
  liveLabel: string | null;
  competitionLine: string;
  homeColor: string;
  awayColor: string;
}

export function MatchScoreHeader({
  homeName,
  awayName,
  homeScore,
  awayScore,
  statusText,
  isLive,
  liveLabel,
  competitionLine,
  homeColor,
  awayColor,
}: MatchScoreHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setCompact(y > 180));

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.88]);

  return (
    <>
      <motion.div
        ref={ref}
        style={{ scale, opacity, transformOrigin: "top center" }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card p-6"
      >
        {/* Instagram-stil gradient-topp: båda lagens riktiga färger diagonalt, fade
            till kortets yta istället för en hård kant — Hampus 2026-10-09 ("gradient
            top, som instagram kör"). Ersätter de två separata glow-cirklarna. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-80 transition-[background] duration-700"
          style={{
            background: `linear-gradient(135deg, ${homeColor}, ${awayColor})`,
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <p className="relative mb-3 text-center text-xs text-muted-foreground">
          {competitionLine}
          {/* text-destructive-ink, inte text-red-500 — samma kontrastfix som redan
              finns på denna sida (a11y-fix, LIVE var svarläst i ljust läge). */}
          {isLive && <span className="ml-2 text-destructive-ink">● LIVE{liveLabel ? ` ${liveLabel}′` : ""}</span>}
        </p>
        <div className="relative flex items-center justify-center gap-6">
          <p className="flex-1 text-right text-lg font-bold">{homeName}</p>
          <div className="text-center">
            <p className="font-mono text-6xl font-bold tabular-nums text-foreground">
              {homeScore}–{awayScore}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{statusText}</p>
          </div>
          <p className="flex-1 text-left text-lg font-bold">{awayName}</p>
        </div>
      </motion.div>

      <AnimatePresence>
        {compact && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="sticky top-0 z-20 -mx-4 border-b border-border bg-card/95 px-4 py-2 backdrop-blur"
          >
            <div className="flex items-center justify-center gap-3 text-sm font-semibold text-foreground">
              <span className="truncate">{homeName}</span>
              <span className="tabular-nums">{homeScore}–{awayScore}</span>
              <span className="truncate">{awayName}</span>
              {isLive && <span className="text-xs text-destructive-ink">●</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
