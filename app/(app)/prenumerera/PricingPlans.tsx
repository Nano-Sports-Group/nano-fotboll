"use client";

/**
 * PricingPlans — Client Component
 * Prisplaner (Free / PRO / Elite) med månad/år-växel och founder-erbjudande.
 * Strategi (Allsvenskans hemmaplan 2026-07-10): gratisplanen är generös
 * (obegränsad feed + push — FotMob-paritet); PRO säljer det unika: daglig
 * AI-brief, poddintelligens och transfer-signaler.
 */

import { useState } from "react";
import type { Plan } from "@/lib/access-rules";
import { Check, Star } from "lucide-react";
import { CheckoutButton } from "./CheckoutButton";
import { VERTICAL } from "@/lib/vertical";
import {
  COMBO_PRICING,
  ELITE_AVAILABLE,
  FOUNDER_OFFER,
  PRICING,
  TRIAL_DAYS,
  amountFor,
  formatKr,
  formatWeeklyKr,
  monthlyEquivalent,
  type BillingInterval,
} from "@/lib/pricing";

const FREE_FEATURES =
  VERTICAL === "hockey"
    ? [
        "Tabell, spelschema och resultat — SHL och HockeyAllsvenskan",
        "Nyhetsflöde för ditt lag",
        "Favoritlag och laghubb",
        "Forum (läs & skriv)",
      ]
    : [
        "Obegränsat nyhetsflöde för ditt lag",
        "Push-notiser — mål, transfers, avspark",
        "Live-resultat, tabell & statistik",
        "Forum (läs & skriv)",
      ];

const PRO_FEATURES =
  VERTICAL === "hockey"
    ? [
        "AI-chatt om lagen, tabellerna och nyheterna",
        "Poddintelligens — sök bland 20 hockeypoddar",
        "Daglig lagbild för ditt lag",
        "Nano Maps Pro ingår — kartspelet utan reklam",
      ]
    : [
        "Daglig AI-brief — text & ljud, 07:00",
        "AI-sammanfattningar av artiklar & matcher",
        "Forum-läget senaste timmarna (4h)",
        "Ryktesradar — transfer före kollegorna",
        "Poddintelligens — sök i Allsvenskans poddar",
        "xG, filter & AI-chat på match/lag",
        "Nano Maps Pro ingår — kartspelet utan reklam",
      ];

/** Hockeyn är påslagen 2026-09-30, men lagbild och poddsammanfattningar byggs upp — säg det. */
const HOCKEY_PRO_NOTE =
  "Hockeyn är ny: lagbilden och poddsammanfattningarna byggs upp under hösten. Du kan avsluta när du vill.";

const ELITE_FEATURES = [
  "Allt i PRO",
  "Cross-source clustering",
  "Vad som spelar roll idag för ditt lag",
  "Trend detection (eskalerande rykten)",
];

/**
 * Veckopriset är ALLTID andra rad och alltid muted. Hero är det Stripe faktiskt
 * drar. Marknadsföringslagen: vi får inte skylta "från 16 kr" när kortet dras 69.
 */
function WeeklyLine({ ore, interval }: { ore: number; interval: BillingInterval }) {
  return <p className="text-xs text-muted-foreground mt-1">{formatWeeklyKr(ore, interval)}</p>;
}

function ProPriceTag({ interval, founder }: { interval: BillingInterval; founder: boolean }) {
  const amount = amountFor("pro", interval, { founder });
  const ordinary = interval === "year" ? PRICING.pro.yearly : PRICING.pro.monthly;
  return (
    <div className="mb-6">
      <h2 className="font-semibold text-2xl text-pitch-ink mb-1 text-balance">PRO</h2>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-foreground">{amount / 100}</span>
        <span className="text-muted-foreground text-sm">kr / {interval === "year" ? "år" : "mån"}</span>
        {founder && (
          <span className="text-sm text-muted-foreground line-through">{ordinary / 100} kr</span>
        )}
      </div>
      <WeeklyLine ore={amount} interval={interval} />
      {founder ? (
        <p className="text-xs text-pitch-ink mt-1 font-medium">
          Founder-pris för alltid — först till {FOUNDER_OFFER.cap}
          {interval === "year" && <> · motsvarar {formatKr(Math.round(amount / 12))}/mån</>}
          {" · "}{TRIAL_DAYS} dagar gratis
        </p>
      ) : interval === "year" ? (
        <p className="text-xs text-pitch-ink mt-1">
          Motsvarar {formatKr(monthlyEquivalent("pro"))}/mån · spara 20 % · {TRIAL_DAYS} dagar gratis
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">{TRIAL_DAYS} dagar gratis · avbryt när som helst</p>
      )}
    </div>
  );
}

function ElitePriceTag({ interval }: { interval: BillingInterval }) {
  const amount = amountFor("elite", interval);
  return (
    <div className="mb-6">
      <h2 className="font-semibold text-2xl text-pitch-ink mb-1 text-balance">ELITE</h2>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-foreground">{amount / 100}</span>
        <span className="text-muted-foreground text-sm">kr / {interval === "year" ? "år" : "mån"}</span>
      </div>
      <WeeklyLine ore={amount} interval={interval} />
      {interval === "year" ? (
        <p className="text-xs text-pitch-ink mt-1">
          Motsvarar {formatKr(monthlyEquivalent("elite"))}/mån · spara 20 %
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">Avbryt när som helst</p>
      )}
    </div>
  );
}

function FeatureList({ features, paid, hero }: { features: string[]; paid: boolean; hero?: number }) {
  return (
    <ul className="flex flex-col gap-3 flex-1 mb-6">
      {features.map((f, i) => (
        <li
          key={f}
          className={`flex items-start gap-3 text-sm ${paid ? "text-foreground" : "text-muted-foreground"} ${hero !== undefined && i < hero ? "font-medium" : ""}`}
        >
          {hero !== undefined && i < hero ? (
            <Star className="w-4 h-4 shrink-0 text-pitch-ink mt-0.5" />
          ) : (
            <Check className={`w-4 h-4 shrink-0 mt-0.5 ${paid ? "text-pitch-ink" : "text-muted-foreground"}`} />
          )}
          {f}
        </li>
      ))}
    </ul>
  );
}

/** Alla sporter i en prenumeration. Priset kommer från COMBO_PRICING — aldrig räknat i klienten. */
function ComboCard({ interval }: { interval: BillingInterval }) {
  const pro = COMBO_PRICING.pro;
  const elite = COMBO_PRICING.elite;
  const amount = interval === "year" ? pro.yearly : pro.monthly;
  const eliteAmount = interval === "year" ? elite.yearly : elite.monthly;
  const unit = interval === "year" ? "år" : "mån";
  return (
    <section
      aria-labelledby="kombo-rubrik"
      className="mt-6 max-w-4xl mx-auto rounded-2xl border border-border bg-card p-6 sm:flex sm:items-center sm:justify-between sm:gap-8"
    >
      <div>
        <h2 id="kombo-rubrik" className="font-semibold text-xl text-foreground text-balance">
          Nano Sport: alla sporter
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          PRO på fotboll och hockey i en prenumeration. Golf följer med när den öppnar, utan påslag. Nano Maps Pro ingår.
        </p>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground tabular-nums">{amount / 100}</span>
          <span className="text-muted-foreground text-sm">kr / {unit}</span>
        </div>
        <WeeklyLine ore={amount} interval={interval} />
        <p className="mt-2 text-xs text-muted-foreground">
          Nano Sport Elite (fotbollens Elite + PRO på övriga sporter): {formatKr(eliteAmount)} / {unit}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:mt-0 sm:w-56 shrink-0">
        <CheckoutButton plan="pro" interval={interval} combo label="Välj Nano Sport PRO" variant="outline" showSignIn={false} />
        <CheckoutButton plan="elite" interval={interval} combo label="Välj Nano Sport Elite" variant="outline" />
      </div>
    </section>
  );
}

function NuvarandePlan() {
  return (
    <div className="h-11 rounded-xl border border-pitch/40 bg-pitch/10 flex items-center justify-center text-sm font-medium text-pitch-ink">
      Nuvarande plan
    </div>
  );
}

/**
 * `currentPlan` kommer från `getUserPlan()` på servern. Kortet för nuvarande
 * plan var tidigare hårdkodat till GRATIS, så en betalande Elite-kund fick veta
 * att hen låg på gratisplanen och erbjöds köpa Elite igen.
 *
 * `founderPublic` kommer från `isFounderOfferPublic()` i server-parenten. Den
 * här komponenten får ALDRIG gissa potten: en klient som antar att Founder är
 * öppet visar 69 kr för plats 501 och lovar ett pris checkout sedan vägrar ge.
 */
export function PricingPlans({
  currentPlan = "free",
  founderPublic = false,
  comboEnabled = false,
}: {
  currentPlan?: Plan;
  founderPublic?: boolean;
  /** Kombo säljs (isComboEnabled() i server-parenten). */
  comboEnabled?: boolean;
}) {
  const [interval, setBilling] = useState<BillingInterval>("month");

  return (
    <>
      {/* Intervall-växel */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setBilling("month")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              interval === "month" ? "pitch-gradient text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Månadsvis
          </button>
          <button
            onClick={() => setBilling("year")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              interval === "year" ? "pitch-gradient text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Årsvis <span className="text-pitch-ink">−20 %</span>
          </button>
        </div>
      </div>

      {/* Planer */}
      <div className={`grid grid-cols-1 gap-6 max-w-4xl mx-auto items-stretch ${ELITE_AVAILABLE ? "sm:grid-cols-3" : "sm:grid-cols-2 max-w-2xl"}`}>
        {/* Gratis */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="font-semibold text-2xl text-foreground mb-1 text-balance">GRATIS</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">0</span>
              <span className="text-muted-foreground text-sm">kr / mån</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Inget kort behövs</p>
          </div>
          <FeatureList features={FREE_FEATURES} paid={false} />
          {currentPlan === "free" ? (
            <NuvarandePlan />
          ) : (
            <div className="h-11 rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground">
              Ingår i din plan
            </div>
          )}
        </div>

        {/* PRO */}
        <div className="relative rounded-2xl border border-pitch/40 bg-card p-6 flex flex-col pitch-glow">
          <div className="absolute -top-3 left-6">
            <span className="px-3 py-1 rounded-full pitch-gradient text-white text-xs font-medium">
              {founderPublic ? `Founder — först till ${FOUNDER_OFFER.cap}` : "Populärast"}
            </span>
          </div>
          <ProPriceTag interval={interval} founder={founderPublic} />
          <FeatureList features={PRO_FEATURES} paid hero={3} />
          {VERTICAL === "hockey" ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{HOCKEY_PRO_NOTE}</p> : null}
          {currentPlan === "pro" ? (
            <NuvarandePlan />
          ) : currentPlan === "elite" ? (
            <div className="h-11 rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground">
              Ingår i Elite
            </div>
          ) : (
            <CheckoutButton
              plan="pro"
              interval={interval}
              label={founderPublic ? "Bli founder" : "Prova PRO"}
            />
          )}
        </div>

        {/* Elite — säljs inte på hockey än */}
        {ELITE_AVAILABLE && (
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <ElitePriceTag interval={interval} />
            <FeatureList features={ELITE_FEATURES} paid />
            {currentPlan === "elite" ? (
              <NuvarandePlan />
            ) : (
              <CheckoutButton plan="elite" interval={interval} label="Välj Elite" variant="outline" />
            )}
          </div>
        )}
      </div>

      {comboEnabled && <ComboCard interval={interval} />}
    </>
  );
}
