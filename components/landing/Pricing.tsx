"use client";

import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Container, Label, Display, Reveal, Section } from "./primitives";
import {
  FOUNDER_OFFER,
  PRICING,
  TRIAL_DAYS,
  formatWeeklyKr,
  listMonthlyKr,
  proOfferMonthlyKr,
} from "@/lib/pricing";

interface PricingProps {
  /** Får Founder visas? Kommer från potten via server parent — aldrig gissat här. */
  founderPublic: boolean;
  /** Waitlist-läge → CTA pekar på /vaenta i stället för /onboarding. */
  waitlistMode?: boolean;
}

export function Pricing({ founderPublic, waitlistMode = false }: PricingProps) {
  const founder = founderPublic;
  const proPrice = proOfferMonthlyKr(founder);
  const proList = listMonthlyKr("pro");
  const elitePrice = listMonthlyKr("elite");
  const paidHref = waitlistMode ? "/vaenta" : "/prenumerera";
  const freeHref = waitlistMode ? "/vaenta" : "/onboarding";
  const proWeekly = formatWeeklyKr(founder ? FOUNDER_OFFER.pricing.monthly : PRICING.pro.monthly);
  const eliteWeekly = formatWeeklyKr(PRICING.elite.monthly);

  const plans = [
    {
      name: "Gratis",
      price: "0",
      priceNote: null as string | null,
      weekly: null as string | null,
      tagline: "Bygg vanan — utan kort.",
      cta: waitlistMode ? "Håll platsen" : "Välj ditt lag",
      href: freeHref,
      highlighted: false,
      badge: null as string | null,
      features: [
        "Obegränsat nyhetsflöde för ditt lag",
        "Push: mål, transfers, avspark",
        "Live-resultat, tabell & statistik",
        "Forum — läs & skriv",
      ],
    },
    {
      name: "PRO",
      price: String(proPrice),
      priceNote: founder ? `ordinarie ${proList} kr` : null,
      weekly: proWeekly,
      tagline: founder
        ? `Founder-pris för alltid · ${TRIAL_DAYS} dagar gratis`
        : `${TRIAL_DAYS} dagar gratis · avbryt när som helst`,
      cta: waitlistMode ? "Håll platsen" : founder ? "Bli founder" : "Prova PRO gratis",
      href: paidHref,
      highlighted: true,
      badge: founder ? `Founder — först till ${FOUNDER_OFFER.cap}` : "Populärast",
      features: [
        "AI-brief + match- & artikelsammanfattning",
        "Forum-läget senaste timmarna",
        "Ryktesradar — var först på transfers",
        "Poddintelligens & AI-chat",
        "xG och avancerade filter",
      ],
    },
    {
      name: "Elite",
      price: String(elitePrice),
      priceNote: null,
      weekly: eliteWeekly,
      tagline: "För dig som vill se signalen först.",
      cta: waitlistMode ? "Håll platsen" : "Skaffa Elite",
      href: paidHref,
      highlighted: false,
      badge: null,
      features: [
        "Allt i PRO",
        "Cross-source clustering",
        "”Det viktigaste idag” för din klubb",
        "Trenddetektering på rykten",
      ],
    },
  ];

  return (
    <Section id="priser">
      <Container>
        <div className="mb-12 text-center md:mb-20">
          <Reveal>
            <Label>Priser</Label>
          </Reveal>
          <Reveal delay={0.08}>
            <Display size="lg" className="mt-4">
              Börja gratis.
              <br />
              Stanna för djupet.
            </Display>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-[420px] text-[17px] leading-[1.65] text-white/55">
              Gratis ger dig flödet. PRO ger dig destillatet — brief, matchanalys,
              forum-läget och transfer-radar — så du är först utan att scrolla.{" "}
              {TRIAL_DAYS} dagar gratis, sedan{" "}
              {founder ? `${proPrice} kr/mån för alltid (ordinarie ${proList})` : `${proList} kr/mån`}.
              Avbryt när du vill.{" "}
              <span className="text-white/40">Årsvis: 20 % rabatt.</span>
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 md:gap-5">
          {plans.map(({ name, price, priceNote, weekly, tagline, cta, href, highlighted, badge, features }, i) => (
            <Reveal key={name} delay={0.06 + i * 0.08}>
              <div
                className={`relative flex h-full flex-col rounded-3xl border p-6 md:p-8 ${
                  highlighted
                    ? "border-pitch/40 bg-pitch/[0.05] shadow-[0_0_48px_-12px_color-mix(in_srgb,var(--pitch)_25%,transparent)]"
                    : "border-white/[0.06] bg-white/[0.025]"
                }`}
              >
                {badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-pitch px-3 py-1 text-xs font-bold uppercase tracking-[var(--tracking-badge)] text-white">
                    {badge}
                  </span>
                )}

                <h3 className="font-heading text-2xl text-white text-balance">{name}</h3>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-heading text-6xl tracking-display text-white">{price}</span>
                  <span className="text-sm text-white/55">kr/mån</span>
                  {priceNote && (
                    <span className="ml-1 text-sm text-white/55 line-through">{priceNote}</span>
                  )}
                </div>
                {/* Andra rad, muted. Aldrig hero — Stripe drar månadspriset. */}
                {weekly && <p className="mt-1 text-sm text-white/40">{weekly}</p>}
                <p className="mt-2 text-sm text-white/50">{tagline}</p>

                <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-white/[0.06] pt-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          highlighted ? "text-pitch-ink" : "text-white/55"
                        }`}
                        strokeWidth={3}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={href}
                  className={`mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold transition-transform duration-200 hover:scale-[1.02] active:scale-[0.97] ${
                    highlighted
                      ? "bg-pitch text-white"
                      : "border border-white/15 text-white hover:border-white/35"
                  }`}
                >
                  {cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
