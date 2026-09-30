"use client";

import { vertical } from "@/lib/vertical";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Search, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BOTTOM_NAV_ITEMS, SECONDARY_NAV_ITEMS } from "@/lib/nav";
import { useModalA11y } from "@/hooks/useModalA11y";
import { openSearchPalette } from "@/hooks/useCommandPalette";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useModalA11y<HTMLDivElement>(open, () => setOpen(false));

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("athopia:open-mobile-menu", handler);
    return () => window.removeEventListener("athopia:open-mobile-menu", handler);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function openSearch() {
    setOpen(false);
    openSearchPalette();
  }

  function openTeamSelect() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("athopia:open-team-select"));
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />

          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Meny"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-[100] w-72 bg-background border-r border-border/50 flex flex-col pt-safe md:hidden focus:outline-none"
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-border/40 shrink-0">
              <span className="font-heading text-lg text-foreground">{vertical.wordmark}</span>
              <button
                aria-label="Stäng meny"
                onClick={() => setOpen(false)}
                className="glass-button inline-flex size-11 items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
              <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Snabbvägar
              </p>
              {BOTTOM_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors ${
                      active
                        ? "text-pitch-ink bg-pitch/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-card"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                );
              })}

              <div className="my-3 border-t border-border/40" />

              <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mer
              </p>
              {SECONDARY_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors ${
                      active
                        ? "text-pitch-ink bg-pitch/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-card"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="shrink-0 border-t border-border/40 px-3 py-3 space-y-1">
              <button
                type="button"
                onClick={openTeamSelect}
                className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              >
                <Users className="w-5 h-5 shrink-0" />
                Byt favoritlag
              </button>
              <button
                type="button"
                onClick={openSearch}
                className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              >
                <Search className="w-5 h-5 shrink-0" />
                Sök
              </button>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[15px] text-muted-foreground">Utseende</span>
                <ThemeToggle />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
