"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, Search } from "lucide-react";
import { openSearchPalette, SEARCH_HREF } from "@/hooks/useCommandPalette";
import { NavAuth } from "@/components/ui/NavAuth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NanoLogo } from "@/components/brand/NanoLogo";
import { vertical } from "@/lib/vertical";

function openSearch(e: React.MouseEvent) {
  // Direkt mot den delade storen: ett window-event når bara lyssnare som redan
  // hunnit monteras, och tappade klick i glappet mellan hydreringar.
  // Modifierade klick lämnas åt webbläsaren (öppna i ny flik).
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
    return;
  e.preventDefault();
  openSearchPalette();
}

export function Header({ clerkEnabled }: { clerkEnabled: boolean }) {
  // Hampus 2026-10-09: "animeras så top-bar försvinner... likt NFL X-funktionen" —
  // samma riktnings-ackumulator-princip som iOS athopiaScrollHidesTopBar()/Android
  // ScrollHidesTopBar(): ett enstaka motsatt scroll-event (bounce, layoutskift)
  // nollställer inte, bara ett verkligt riktningsbyte gör.
  const [hidden, setHidden] = useState(false);
  const accumulated = useRef(0);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    if (y <= 8) {
      accumulated.current = 0;
      setHidden(false);
      return;
    }
    const delta = y - (scrollY.getPrevious() ?? y);
    if ((delta > 0 && accumulated.current < 0) || (delta < 0 && accumulated.current > 0)) {
      accumulated.current = 0;
    }
    accumulated.current += delta;
    if (accumulated.current > 48) {
      setHidden(true);
      accumulated.current = 0;
    } else if (accumulated.current < -48) {
      setHidden(false);
      accumulated.current = 0;
    }
  });

  return (
    <motion.header
      className="glass-bar sticky top-0 z-50"
      animate={{ y: hidden ? "-100%" : 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
    >
      <div className="w-full px-3 sm:px-6 h-12 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-1">
          {/* Hamburger — mobile only, opens MobileNav drawer */}
          <button
            aria-label="Öppna meny"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("athopia:open-mobile-menu"))
            }
            className="group md:hidden -ml-2.5 size-11 flex items-center justify-center rounded-full text-muted-foreground
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="glass-button flex size-8 items-center justify-center group-hover:text-foreground">
              <Menu className="size-4" />
            </span>
          </button>
          <Link
            href="/"
            aria-label={`${vertical.productName} startsida`}
            className="inline-flex h-11 shrink-0 items-center rounded-md font-heading text-base sm:text-xl text-foreground hover:text-pitch-ink transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* Märket ärver textfärgen via currentColor — ett ljust/mörkt-läge
                behöver ingen andra fil och ingen bildväxling. */}
            <NanoLogo size="md" decorative />
            <span className="ml-2 tracking-[0.08em] sm:tracking-widest">
              {vertical.wordmark}
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Riktig länk, inte knapp: ett klick före hydrering navigerar till
              ?sok=1 och dialogen öppnas av URL:en. Efter hydrering tar onClick
              över och öppnar utan navigering. */}
          <a
            href={SEARCH_HREF}
            onClick={openSearch}
            aria-label="Sök"
            title="Sök (⌘K)"
            className="group flex size-11 items-center justify-center rounded-full text-muted-foreground
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* 44px klickyta, 32px synlig glasbubbla: i samma skala som logotypen (24px). */}
            <span className="glass-button flex size-8 items-center justify-center group-hover:text-foreground">
              <Search className="size-4" />
            </span>
          </a>
          {/* Temaväxlaren finns redan i mobilmenyn ("Utseende") — att bära den
              även i headern dubblerar kontrollen och spräcker raden på 320px. */}
          <span className="hidden md:inline-flex">
            <ThemeToggle />
          </span>
          <NavAuth clerkEnabled={clerkEnabled} />
        </div>
      </div>
    </motion.header>
  );
}
