"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { SlidersHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { transitions } from "@/lib/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet, SheetContent, SheetTitle, SheetClose } from "@/components/ui/TactileSheet";

const TABS = [
  { id: "tabell", label: "Tabell" },
  { id: "skytteliga", label: "Skytteliga" },
  { id: "assistligan", label: "Assistligan" },
  { id: "xg", label: "xG-tabell" },
  { id: "form", label: "Form" },
  { id: "press", label: "Spelarstats" },
  { id: "h2h", label: "H2H" },
  { id: "projektion", label: "Titel %" },
  { id: "luck", label: "Tur/Otur" },
  { id: "clutch", label: "Clutch" },
];

const SEASONS = ["2026", "2025"];

export function StatistikTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeTab = searchParams.get("tab") ?? "tabell";
  const sasong = searchParams.get("sasong") ?? "2026";
  const omgang = searchParams.get("omgang") ?? "alla";
  const filterActive = sasong !== "2026" || omgang !== "alla";

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      p.set(k, v);
    }
    return `${pathname}?${p.toString()}`;
  }

  function apply(overrides: Record<string, string>) {
    router.replace(buildUrl(overrides), { scroll: false });
  }

  return (
    <div className="sticky top-[57px] z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-2 py-2">
          {/* Tab-pills med spring-animerad aktiv markör */}
          <nav className="flex gap-1 overflow-x-auto scrollbar-none flex-1" aria-label="Statistikvyer">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={buildUrl({ tab: tab.id })}
                  replace
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "relative whitespace-nowrap rounded-full px-4 min-h-11 sm:min-h-9 inline-flex items-center text-sm font-medium transition-colors select-none touch-manipulation",
                    isActive ? "text-neutral-900" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="statistik-tab-pill"
                      transition={transitions.snappy}
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Filter → Sheet */}
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <button
              onClick={() => setFilterOpen(true)}
              aria-label="Filtrera säsong och omgång"
              className={clsx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 min-h-11 sm:min-h-9 text-sm font-medium transition-colors touch-manipulation",
                filterActive
                  ? "border-white bg-white text-neutral-900 shadow-sm"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{sasong}{omgang !== "alla" ? ` · Omg ${omgang}` : ""}</span>
            </button>
            <SheetContent>
              <div className="space-y-6 pb-4">
                <SheetTitle>Filtrera statistik</SheetTitle>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Säsong</p>
                  <SegmentedControl
                    aria-label="Säsong"
                    options={SEASONS.map((s) => ({ value: s, label: s }))}
                    value={sasong}
                    onChange={(v) => apply({ sasong: v })}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Omgång</p>
                  <select
                    value={omgang}
                    aria-label="Omgång"
                    onChange={(e) => apply({ omgang: e.target.value })}
                    className="w-full min-h-11 text-sm bg-card border border-border rounded-xl px-3 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <option value="alla">Alla omgångar</option>
                    {Array.from({ length: 33 }, (_, i) => String(i + 1)).map((r) => (
                      <option key={r} value={r}>Omgång {r}</option>
                    ))}
                  </select>
                </div>

                <SheetClose asChild>
                  <button className="w-full rounded-xl bg-pitch px-4 py-3 text-sm font-medium text-white transition-opacity active:opacity-80">
                    Klar
                  </button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
