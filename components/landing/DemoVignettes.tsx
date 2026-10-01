"use client";

/* Levande produktdemos — forumet spelas upp som en chatt och nyhetsflödet
   poppar in signal för signal. Loopande, spring-fysik via motion/react.
   Tydligt märkta som demo (fiktiv konversation, inga påhittade siffror). */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Container } from "./primitives";
import { getTeamAccent, getTeamInk } from "@/lib/team-colors";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 30 };

// ─── Forum-chatten ────────────────────────────────────────────────────────────

const CHAT: { name: string; team: string; short: string; text: string }[] = [
  { name: "Sofia", team: "hammarby", short: "HIF", text: "3-5-2 i andra halvlek — äntligen vågar vi." },
  { name: "Jonte", team: "aik", short: "AIK", text: "Vår mittback vinner ju varenda duell. Statistiken ljuger inte." },
  { name: "Elsa", team: "djurgarden", short: "DIF", text: "Kolla xG-kartan från igår. Vi skapade mer än det såg ut." },
  { name: "Ali", team: "malmo-ff", short: "MFF", text: "Nano-betyget gav vår sexa 8.1. Helt rätt för en gångs skull." },
  { name: "Nils", team: "ifk-goteborg", short: "IFK", text: "Matchtråden ikväll blir kaos. På bästa sätt." },
];

function ChatDemo() {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? CHAT.length : 1);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setCount((c) => (c >= CHAT.length ? 1 : c + 1));
    }, 2200);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div className="flex h-full flex-col justify-end gap-2.5 overflow-hidden">
      <AnimatePresence initial={false}>
        {CHAT.slice(0, count).map((m) => (
          <motion.div
            key={m.name + m.text}
            layout
            initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={SPRING}
            className="flex items-start gap-2.5"
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: getTeamAccent(m.team) }}
              aria-hidden
            >
              {m.name[0]}
            </span>
            <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.05] px-3.5 py-2.5">
              <p className="text-xs font-semibold text-white/90">
                {m.name}{" "}
                <span style={{ color: getTeamInk(m.team).dark }} className="font-bold">({m.short})</span>
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-white/70">{m.text}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Nyhetsploppet ────────────────────────────────────────────────────────────

const NEWS: { tier: string; title: string; source: string }[] = [
  { tier: "breaking", title: "Landslagsmittfältaren klar — presenteras på förmiddagen", source: "3 källor" },
  { tier: "major", title: "Skadeuppdatering inför omgången: två tillbaka i träning", source: "2 källor" },
  { tier: "normal", title: "Så pressade nykomlingen serieledaren — xG-analysen", source: "Nano Fotboll AI" },
  { tier: "major", title: "Tränaren om formsvackan: \"Vi vet exakt vad som saknas\"", source: "2 källor" },
];

const TIER_DOT: Record<string, string> = {
  breaking: "bg-red-500",
  major: "bg-orange-400",
  normal: "bg-pitch",
};

function NewsDemo() {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? NEWS.length : 1);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setCount((c) => (c >= NEWS.length ? 1 : c + 1));
    }, 2600);
    return () => clearInterval(t);
  }, [reduced]);

  const visible = NEWS.slice(0, count).slice().reverse(); // nyast överst

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden">
      <AnimatePresence initial={false}>
        {visible.map((n) => (
          <motion.div
            key={n.title}
            layout
            initial={reduced ? false : { opacity: 0, y: -22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={SPRING}
            className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-3"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIER_DOT[n.tier]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-snug text-white/85">{n.title}</p>
              <p className="mt-1 text-xs text-white/55">{n.source} · just nu</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Sektionen ────────────────────────────────────────────────────────────────

function VignetteFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between px-1 pb-3">
        <h3 className="font-heading text-2xl uppercase tracking-wide text-white text-balance">{title}</h3>
        <span className="text-xs text-white/55">{caption}</span>
      </div>
      <div className="h-[340px] rounded-3xl border border-white/10 bg-zinc-900/60 p-4 sm:p-5">
        {children}
      </div>
    </div>
  );
}

export function DemoVignettes() {
  return (
    <section className="py-16 md:py-24" aria-label="Produktdemos">
      <Container>
        <div className="grid gap-8 md:grid-cols-2 md:gap-6">
          <VignetteFrame title="Snacket. Live." caption="Demo — så låter forumet">
            <ChatDemo />
          </VignetteFrame>
          <VignetteFrame title="Nyheter. Direkt." caption="Demo — så landar signalerna">
            <NewsDemo />
          </VignetteFrame>
        </div>
      </Container>
    </section>
  );
}
