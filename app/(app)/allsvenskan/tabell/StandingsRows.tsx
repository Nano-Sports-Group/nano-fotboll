"use client";

import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import type { SMStandingRow } from "@/lib/db/fixtures";
import { VERTICAL } from "@/lib/vertical";

// 60fps duolingo-league-promotion-zone-move-up-animation (nano-components/patterns/
// matchsida-statistik/README.md §2a): en rad FLIP-animerar till sin nya plats med
// motion's layout-prop i stället för att hoppa. OBS: idag triggas detta bara av en
// NY sidladdning (ISR, revalidate 60s) — sidan pollar inte standings client-side, så
// en besökare ser bara animationen om denna lista återanvänds i en framtida
// klient-pollad vy. Kablad och redo, inte synligt varje dag ännu — se GAPS.md.

export type Zone = "cl" | "el" | "playoff" | "relegation" | null;

export function zoneFor(position: number): Zone {
  if (VERTICAL === "hockey") return null;
  if (position === 1) return "cl";
  if (position === 2 || position === 3) return "el";
  if (position === 14) return "playoff";
  if (position >= 15) return "relegation";
  return null;
}

export const ZONE_DOT: Record<Exclude<Zone, null>, string> = {
  cl: "bg-success",
  el: "bg-sky-500",
  playoff: "bg-amber-500",
  relegation: "bg-destructive",
};

export const ZONE_LABEL: Record<Exclude<Zone, null>, string> = {
  cl: "Champions League",
  el: "Europa/Conference League",
  playoff: "Kval",
  relegation: "Nedflyttning",
};

export function StandingsRows({ standings }: { standings: SMStandingRow[] }) {
  return (
    <LayoutGroup>
      {standings.map((row) => {
        const zone = zoneFor(row.position);
        return (
          <motion.tr
            key={row.team.slug ?? row.team.name}
            layout
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="border-b border-border/50 hover:bg-muted/20 transition-colors"
          >
            <td className="py-3 px-4 text-muted-foreground font-mono tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                {zone && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ZONE_DOT[zone]}`} aria-hidden />}
                {row.position}
                {row.trend != null && row.trend !== 0 && (
                  <span
                    className={`text-xs leading-none ${row.trend > 0 ? "text-success" : "text-red-400"}`}
                    title={row.trend > 0 ? `Upp ${row.trend}` : `Ner ${Math.abs(row.trend)}`}
                    aria-label={row.trend > 0 ? `Klättrat ${row.trend} placeringar` : `Tappat ${Math.abs(row.trend)} placeringar`}
                  >
                    {row.trend > 0 ? "▲" : "▼"}
                  </span>
                )}
              </span>
            </td>
            <td className="py-3 px-4">
              <Link
                href={`/lag/${row.team.slug ?? row.team.name.toLowerCase().replace(/\s+/g, "-").replace(/[åä]/g, "a").replace(/ö/g, "o")}`}
                className="font-medium hover:text-pitch-ink transition-colors"
              >
                {row.team.name}
              </Link>
            </td>
            <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.played}</td>
            <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.wins}</td>
            <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.draws}</td>
            <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.losses}</td>
            <td className="py-3 px-3 text-center text-muted-foreground hidden sm:table-cell font-mono tabular-nums">{row.goals_for}</td>
            <td className="py-3 px-3 text-center text-muted-foreground hidden sm:table-cell font-mono tabular-nums">{row.goals_against}</td>
            <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}</td>
            <td className="py-3 px-4 text-center font-bold text-foreground font-mono tabular-nums">{row.points}</td>
            <td className="py-3 px-3 text-center hidden md:table-cell">
              <span className="flex gap-0.5 justify-center">
                {row.form.map((r, fi) => (
                  <span
                    key={fi}
                    className={`w-4 h-4 rounded-sm text-[9px] font-bold flex items-center justify-center ${r === "W" ? "bg-success/20 text-success" : r === "L" ? "bg-red-400/20 text-destructive-ink" : "bg-muted text-muted-foreground"}`}
                  >
                    {r === "W" ? "V" : r === "L" ? "F" : "O"}
                  </span>
                ))}
              </span>
            </td>
          </motion.tr>
        );
      })}
    </LayoutGroup>
  );
}
