"use client";

import Link from "next/link";
import { AppStoreBadge } from "./AppStoreBadge";
import { ArrowRight } from "lucide-react";
import { Container, Label, Reveal, Section } from "./primitives";
import { FOUNDER_OFFER, PRICING, TRIAL_DAYS } from "@/lib/pricing";
import { primaryCtaHref } from "@/lib/waitlist/mode";

/**
 * Open product CTAs — no client-side beta gate.
 *
 * `founderPublic` kommer från servern. När potten är slut nämns Founder inte
 * alls här: ingen överstruken 69, ingen "full men klicka ändå". Då är PRO 89
 * det enda som finns.
 */
export function FinalCta({
  founderPublic = false,
  waitlistMode = false,
}: {
  founderPublic?: boolean;
  waitlistMode?: boolean;
} = {}) {
  const ctaHref = primaryCtaHref(waitlistMode);
  return (
    <Section>
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] px-6 py-16 text-center md:px-20 md:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 90% at 50% 50%, rgba(45,83,73,0.08) 0%, transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative z-10">
            <Reveal>
              <Label>Säsongen väntar</Label>
            </Reveal>

            <Reveal delay={0.08}>
              <h2 className="mt-4 font-heading text-[clamp(3rem,9vw,7rem)] leading-[0.94] tracking-wide text-balance">
                Nästa omgång
                <br />
                läser du den
                <br />
                <span className="text-pitch-ink">här.</span>
              </h2>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mx-auto mb-10 mt-6 max-w-[400px] text-[17px] leading-[1.65] text-white/55">
                Gratis flöde utan kort. Vill du ha briefen och signalerna — PRO
                med {TRIAL_DAYS} dagar gratis
                {founderPublic
                  ? `, founder-pris ${FOUNDER_OFFER.pricing.monthly / 100} kr för de första ${FOUNDER_OFFER.cap}`
                  : `, ${PRICING.pro.monthly / 100} kr/mån`}
                . Avsluta när du vill.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <Link
                href={ctaHref}
                className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-pitch px-10 text-lg font-bold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.97]"
              >
                {waitlistMode ? "Håll platsen" : "Välj ditt lag"} <ArrowRight className="h-5 w-5" />
              </Link>
              <div className="mt-4 flex justify-center">
                <AppStoreBadge />
              </div>
              <p className="mt-6 text-xs text-white/55">
                Allsvenskan 2026 · Tidig version · Uppdateras varje omgång
              </p>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
