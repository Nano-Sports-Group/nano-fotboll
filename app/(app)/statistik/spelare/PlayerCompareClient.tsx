"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import dynamic from "next/dynamic";
import type { PlayerRadarSeries } from "@/components/team-hub/PlayerRadar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";

const PlayerRadar = dynamic(
  () => import("@/components/team-hub/PlayerRadar").then((m) => m.PlayerRadar),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-wave bg-muted/40" /> }
);
import { SCOUT_METRICS, type ScoutPlayer, type ScoutMetricKey } from "@/lib/team-hub/scout-metrics";

const RADAR_METRICS: ScoutMetricKey[] = ["goals", "assists", "shots", "key_passes", "passes", "rating"];
// Ink-varianten så att serien också syns mot mörk bakgrund i diagrammet.
const COLOR_A = "var(--color-pitch-ink)";
const COLOR_B = "var(--color-away)";

type PositionFilter = "all" | "goalkeeper" | "defender" | "midfielder" | "attacker";
const POSITION_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "attacker", label: "Forwards" },
  { value: "midfielder", label: "Mittfältare" },
  { value: "defender", label: "Försvarare" },
  { value: "goalkeeper", label: "Målvakter" },
];

function percentile(values: number[], v: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((x) => x < v).length;
  const equal = values.filter((x) => x === v).length;
  return Math.round(((below + equal / 2) / values.length) * 100);
}

/** Sökbar combobox för spelarvalet — ersätter native <select>. */
function PlayerCombobox({ pool, value, onChange, label, color }: {
  pool: ScoutPlayer[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  color: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = pool.find((p) => String(p.player_id) === value) ?? null;

  // Stäng vid klick utanför
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return pool.slice(0, 50); // visa 50 när ingen sökning
    return pool.filter(
      (p) => p.fullname.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [pool, query]);

  const select = useCallback((p: ScoutPlayer) => {
    onChange(String(p.player_id));
    setQuery("");
    setOpen(false);
  }, [onChange]);

  return (
    <div ref={containerRef} className="relative space-y-1">
      {/* Seriefärgen bär bara 3:1-kravet (icke-text). Som textfärg föll den
          under AA — #2D5349 gav 2:1 på mörkt kort, #3B82F6 3.7:1 på vitt.
          Färgen visas nu som en prick och etiketten står i läsbar brödtextfärg,
          vilket dessutom slutar förlita sig på färg som enda bärare (WCAG 1.4.1). */}
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-2.5 min-h-11 sm:min-h-9 transition-colors",
          open ? "border-ring ring-2 ring-ring/30" : "border-border"
        )}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {!open && selected ? (
          <span className="flex-1 text-sm text-foreground truncate py-1.5 cursor-pointer">
            {selected.fullname}
            <span className="text-muted-foreground ml-1 text-xs">· {selected.team_name}</span>
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={selected ? selected.fullname : "Sök spelare eller lag…"}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1.5"
            aria-label={label}
            autoComplete="off"
          />
        )}
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground text-xs px-1"
            aria-label="Rensa val"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
        >
          {filtered.map((p) => (
            <li
              key={p.player_id}
              role="option"
              aria-selected={String(p.player_id) === value}
              // preventDefault på pointerdown håller fokus kvar i fältet (annars
              // blur:ar listan bort under fingret), men VALET sker på click —
              // alltså vid uppsläpp. Det ger ångerrätt: drar man bort fingret
              // från raden uteblir click och inget väljs.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => select(p)}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer select-none",
                String(p.player_id) === value
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted/60 text-foreground"
              )}
            >
              <span className="font-medium truncate">{p.fullname}</span>
              <span className="text-muted-foreground text-xs ml-2 shrink-0">{p.team_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlayerCompareClient({ pool }: { pool: ScoutPlayer[] }) {
  const [posFilter, setPosFilter] = useState<PositionFilter>("all");
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  const filteredPool = useMemo(() => {
    const base = [...pool].sort((a, b) => a.fullname.localeCompare(b.fullname, "sv"));
    if (posFilter === "all") return base;
    return base.filter((p) => p.position === posFilter);
  }, [pool, posFilter]);

  // Nollställ val vid positions-byte om spelaren inte finns i den nya poolen
  // Justeras under render: konvergerar direkt eftersom "" alltid är giltigt.
  if (idA && !filteredPool.some((p) => String(p.player_id) === idA)) setIdA("");
  if (idB && !filteredPool.some((p) => String(p.player_id) === idB)) setIdB("");

  const cols = useMemo(() => {
    const out = {} as Record<ScoutMetricKey, number[]>;
    const active = filteredPool.filter((p) => p.minutes > 0);
    for (const m of SCOUT_METRICS) out[m.key] = active.map((p) => p[m.key]);
    return out;
  }, [filteredPool]);

  const playerA = pool.find((p) => String(p.player_id) === idA) ?? null;
  const playerB = pool.find((p) => String(p.player_id) === idB) ?? null;

  function toSeries(p: ScoutPlayer, name: string, color: string): PlayerRadarSeries {
    return {
      name, color,
      values: RADAR_METRICS.map((key) => {
        const label = SCOUT_METRICS.find((m) => m.key === key)?.label ?? key;
        return { metric: label, value: percentile(cols[key], p[key]), raw: p[key] };
      }),
    };
  }

  const series: PlayerRadarSeries[] = [];
  if (playerA) series.push(toSeries(playerA, playerA.fullname, COLOR_A));
  if (playerB) series.push(toSeries(playerB, playerB.fullname, COLOR_B));

  const fmt = (k: ScoutMetricKey, v: number) => (k === "rating" ? v.toFixed(2) : v);

  return (
    <div className="space-y-5">
      {/* Positions-filter */}
      <SegmentedControl
        options={POSITION_OPTIONS}
        value={posFilter}
        onChange={setPosFilter}
        aria-label="Filtrera på position"
      />

      {/* Spelarpickers */}
      <div className="rounded-2xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlayerCombobox pool={filteredPool} value={idA} onChange={setIdA} label="Spelare A" color={COLOR_A} />
        <PlayerCombobox pool={filteredPool} value={idB} onChange={setIdB} label="Spelare B" color={COLOR_B} />
      </div>

      {!playerA && !playerB ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-foreground">Välj en spelare att jämföra mot ligan</p>
          <p className="text-xs text-muted-foreground mt-1">Lägg till en andra spelare för head-to-head.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Radar */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-2">Profil · percentil vs ligan</p>
            <PlayerRadar series={series} />
            <p className="text-xs text-muted-foreground text-center mt-1">100 = bäst i ligan · 50 = median</p>
          </div>

          {/* Stat-rader */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-3">Råvärden</p>
            <div className="grid grid-cols-3 items-center py-2 border-b border-border/60 text-xs text-muted-foreground">
              <span className="text-right pr-4 font-semibold truncate" style={{ color: COLOR_A }}>{playerA?.fullname ?? "—"}</span>
              <span className="text-center">Mätvärde</span>
              <span className="text-left pl-4 font-semibold truncate" style={{ color: COLOR_B }}>{playerB?.fullname ?? "—"}</span>
            </div>
            {SCOUT_METRICS.map((m) => {
              const a = playerA ? playerA[m.key] : null;
              const b = playerB ? playerB[m.key] : null;
              const aWins = a != null && b != null && a > b;
              const bWins = a != null && b != null && b > a;
              return (
                <div key={m.key} className="grid grid-cols-3 items-center py-2 border-b border-border/40 last:border-0">
                  <span className={cn(
                    "text-sm font-semibold font-mono tabular-nums text-right pr-4",
                    aWins ? "text-success" : "text-foreground"
                  )}>{a != null ? fmt(m.key, a) : "—"}</span>
                  <span className="text-xs text-center text-muted-foreground">{m.label}</span>
                  <span className={cn(
                    "text-sm font-semibold font-mono tabular-nums text-left pl-4",
                    bWins ? "text-blue-400" : "text-foreground"
                  )}>{b != null ? fmt(m.key, b) : "—"}</span>
                </div>
              );
            })}
            <div className="grid grid-cols-3 items-center pt-3 text-xs">
              <Link
                href={playerA ? `/spelare/${playerA.slug ?? playerA.player_id}` : "#"}
                className="text-right pr-4 text-muted-foreground hover:text-pitch-ink"
              >{playerA ? "Profil →" : ""}</Link>
              <span />
              <Link
                href={playerB ? `/spelare/${playerB.slug ?? playerB.player_id}` : "#"}
                className="text-left pl-4 text-muted-foreground hover:text-blue-400"
              >{playerB ? "Profil →" : ""}</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
