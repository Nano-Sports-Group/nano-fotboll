"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Team {
  name: string;
  slug: string;
}

interface TeamSearchBarProps {
  teams: Team[];
}

export function TeamSearchBar({ teams }: TeamSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [a, setA] = useState(searchParams.get("a") ?? "");
  const [b, setB] = useState(searchParams.get("b") ?? "");

  const handleCompare = () => {
    if (!a || !b) return;
    router.push(`/statistik/jamfor?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  };

  const selectClass =
    "w-full bg-background border border-border rounded-lg px-3 min-h-11 sm:min-h-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pitch focus:border-transparent cursor-pointer";

  return (
    // Hampus 2026-10-09: "jämförelse tabsen bredvid varandra, snarare än ovanpå
    // varandra" — alltid flex-row, även på mobil (var sm:flex-row innan, staplade
    // under den breakpointen). Samma layoutbeslut på iOS/Android i samma pass.
    <div className="flex flex-row gap-3 items-end">
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-muted-foreground mb-1">Lag A</label>
        <select className={selectClass} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Välj lag...</option>
          {teams.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-muted-foreground font-bold text-lg pb-2">vs</div>

      <div className="flex-1 min-w-0">
        <label className="block text-xs text-muted-foreground mb-1">Lag B</label>
        <select className={selectClass} value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">Välj lag...</option>
          {teams.filter((t) => t.slug !== a).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleCompare}
        disabled={!a || !b || a === b}
        className="px-5 min-h-11 sm:min-h-9 rounded-lg bg-pitch text-white text-sm font-medium hover:bg-pitch/90 active:opacity-80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap touch-manipulation"
      >
        Jämför →
      </button>
    </div>
  );
}
