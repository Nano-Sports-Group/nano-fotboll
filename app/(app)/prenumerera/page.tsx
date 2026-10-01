/**
 * app/prenumerera/page.tsx — Prissida
 * ─────────────────────────────────────────────────────────────────────────────
 * Free / PRO 89 kr / Elite 169 kr — 20 % rabatt på årsplan.
 * Plan-val + Stripe Checkout sker i PricingPlans (Client Component).
 *
 * Founder visas bara när potten har platser kvar. Den boolean kommer härifrån
 * (server) och skickas ned — klienten gissar aldrig.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { Zap } from "lucide-react";
import { ELITE_AVAILABLE, FOUNDER_OFFER, PRICING, TRIAL_DAYS, isComboEnabled } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site-url";
import { PricingPlans } from "./PricingPlans";
import { getUserPlan } from "@/lib/user-plan";
import { isFounderOfferPublic } from "@/lib/founder-offer";
import { jsonLd } from "@/lib/json-ld";
import { VERTICAL, vertical } from "@/lib/vertical";

const HOCKEY = VERTICAL === "hockey";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Priser & Prenumeration",
  description: HOCKEY
    ? "Nano Hockey PRO — SHL och HockeyAllsvenskan för ditt lag. 20 % rabatt på årsplan."
    : "Nano Fotboll PRO — daglig AI-brief för ditt lag, poddintelligens och transfer-signaler. 20 % rabatt på årsplan.",
  alternates: { canonical: absoluteUrl("/prenumerera") },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: absoluteUrl("/prenumerera"),
    title: "Priser & Prenumeration",
    description: `${ELITE_AVAILABLE ? "Gratis, PRO eller Elite" : "Gratis eller PRO"} — välj din plan för ${vertical.leagueName}-bevakning på djupet.`,
  },
};

/**
 * Strukturerad data måste spegla vad kortet faktiskt dras på. PRO låg tidigare
 * som "69" i JSON-LD medan listpriset var 89 — Google visade alltså ett pris
 * ingen kunde få när potten var slut. Founder är ett eget erbjudande och finns
 * bara med när det finns platser kvar.
 */
function PricingJsonLd({ founderPublic }: { founderPublic: boolean }) {
  const kr = (ore: number) => String(ore / 100);
  const offer = (price: string, name: string, position: number) => ({
    "@type": "ListItem",
    position,
    item: {
      "@type": "Product",
      name,
      offers: {
        "@type": "Offer",
        price,
        priceCurrency: "SEK",
        availability: "https://schema.org/InStock",
      },
    },
  });

  const items = [
    offer("0", `${vertical.productName} Gratis`, 1),
    ...(founderPublic
      ? [offer(kr(FOUNDER_OFFER.pricing.monthly), `${vertical.productName} PRO Founder`, 2)]
      : []),
    offer(kr(PRICING.pro.monthly), `${vertical.productName} PRO`, founderPublic ? 3 : 2),
    ...(ELITE_AVAILABLE ? [offer(kr(PRICING.elite.monthly), `${vertical.productName} Elite`, founderPublic ? 4 : 3)] : []),
  ];

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${vertical.productName} prenumerationsplaner`,
      itemListElement: items,
    })}} />
  );
}

export default async function PrenumereraPage() {
  // Planen läses server-side (CLAUDE.md: aldrig client-side paywall-beslut).
  const [plan, founderPublic] = await Promise.all([getUserPlan(), isFounderOfferPublic()]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
      <PricingJsonLd founderPublic={founderPublic} />
      {/* Rubrik */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pitch/15 border border-pitch/30 text-pitch-ink text-sm font-medium mb-6">
          <Zap className="w-4 h-4" />
          {founderPublic
            ? `Founder-pris: ${FOUNDER_OFFER.pricing.monthly / 100} kr/mån för alltid — först till ${FOUNDER_OFFER.cap}`
            : `PRO ${TRIAL_DAYS} dagar gratis · sedan ${PRICING.pro.monthly / 100} kr/mån`}
        </div>
        <h1 className="font-bold text-4xl sm:text-6xl md:text-7xl text-foreground mb-4 text-balance">
          {HOCKEY ? "SHL PÅ DJUPET" : "ALLSVENSKANS HEMMAPLAN"}
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          {HOCKEY
            ? "Tabell, spelschema och resultat för ditt lag i SHL och HockeyAllsvenskan — samlat på ett ställe."
            : "Allt som sägs och händer kring din klubb — läst, lyssnat och siffergranskat åt dig. Varje morgon."}
        </p>
      </div>

      <PricingPlans currentPlan={plan} founderPublic={founderPublic} comboEnabled={isComboEnabled()} />

      {!HOCKEY && <p className="text-center text-sm text-muted-foreground mt-10 max-w-lg mx-auto">
        Gratis ger dig flödet. PRO ger dig morgonbriefen, poddintelligensen och
        transfer-signalerna — det som tar bort nio flikar. Elite lägger till
        clustering och ”vad som spelar roll idag”.
      </p>}

      <p className="text-center text-xs text-muted-foreground mt-6">
        {TRIAL_DAYS} dagar gratis · Betalning via Stripe · SSL · Avbryt när som helst
      </p>
      <p className="text-center text-xs text-muted-foreground mt-2">
        Genom att prenumerera godkänner du{" "}
        <a href="/anvandarvillkor" className="underline underline-offset-2 hover:text-foreground">användarvillkoren</a>.
      </p>
    </div>
  );
}
