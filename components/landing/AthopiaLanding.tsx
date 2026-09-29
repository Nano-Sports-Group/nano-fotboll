"use client";

/* Nano Fotboll landningssida — native-app-känsla i webbläsaren.
   Designsystem: docs/brand/BRAND.md — 8px-grid, Geist, Racing Green #2D5349 på true black.
   Mockup-skärmarna återskapar appens ljusa glas-UI som riktiga komponenter.
   Touch: alla interaktiva element ≥44px, primär-CTA i tumzonen via MobileDock. */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LandingNav } from "./LandingNav";
import { Hero, type HeroPulse, type ClubChip, type LandingHeroCopy } from "./Hero";
import { SportCards } from "./SportCards";
import { LandingFooter } from "./LandingFooter";
import { MobileDock } from "./MobileDock";

/* Below-fold marketing-sektioner behövs inte för första paint/hydrering.
   next/dynamic(ssr:false) delar upp dem i egna chunks som laddas EFTER
   ovanför-vikten (nav+hero+MobileDock) har hydrerats — så deras JS
   (inkl. motion/react-animationer) blockerar inte FCP/TBT. Ren client-only
   kod (ingen data-fetch, ingen SEO-text att SSR:a) så ssr:false är säkert. */
const DemoVignettes = dynamic(() => import("./DemoVignettes").then((m) => m.DemoVignettes), {
  ssr: false,
});
const ExperienceSection = dynamic(() => import("./ExperienceSection").then((m) => m.ExperienceSection), {
  ssr: false,
});
const Pricing = dynamic(() => import("./Pricing").then((m) => m.Pricing), { ssr: false });
const Faq = dynamic(() => import("./Faq").then((m) => m.Faq), { ssr: false });
const FinalCta = dynamic(() => import("./FinalCta").then((m) => m.FinalCta), { ssr: false });

/** Kompat med app/page.tsx tills nya landningen kopplar in nyhetsdata. */
export interface LandingArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  sourceName: string;
  publishedAt: string;
}

export default function AthopiaLanding({
  sportSlot,
  pulse,
  clubs,
  heroCopy,
  waitlistMode = false,
}: {
  articles?: LandingArticle[];
  /** Server-renderad sportsektion (matchcenter/tabell/nyheter) — sport före marketing. */
  sportSlot?: React.ReactNode;
  pulse?: HeroPulse;
  clubs?: ClubChip[];
  heroCopy?: LandingHeroCopy;
  waitlistMode?: boolean;
} = {}) {
  // Fail-closed: visa inte Founder förrän potten svarat. ISR får inte baka in 69.
  const [founderPublic, setFounderPublic] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing/state")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { founderPublic?: unknown } | null) => {
        if (!cancelled && data?.founderPublic === true) setFounderPublic(true);
      })
      .catch(() => {
        /* stängd pott är det säkra antagandet */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    // `dark` på roten: landningssidan är alltid svart oavsett användarens tema,
    // så tokens måste lösas till sina mörka valörer. Utan detta blev accenten
    // som text #2D5349 på svart (2.45:1) för besökare med ljust tema.
    // Custom properties ärvs, så klassen räcker här — den behöver inte ligga
    // på <html>.
    <div className="dark min-h-screen overflow-x-clip bg-black font-sans text-white">
      <LandingNav />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Hero pulse={pulse} clubs={clubs} copy={heroCopy} waitlistMode={waitlistMode} />
        <SportCards />
        {sportSlot}
        <DemoVignettes />
        <ExperienceSection />
        <Pricing founderPublic={founderPublic} waitlistMode={waitlistMode} />
        <Faq founderPublic={founderPublic} />
        <FinalCta founderPublic={founderPublic} waitlistMode={waitlistMode} />
      </main>
      <LandingFooter />
      <MobileDock />
    </div>
  );
}
