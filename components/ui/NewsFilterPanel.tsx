"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { clsx } from "clsx";
import {
  type NewsFilterState,
  DEFAULT_NEWS_FILTER,
  filterStateToParams,
  paramsToFilterState,
  isDefaultFilter,
} from "@/lib/filters";

const ALLSVENSKAN_TEAMS = [
  { slug: "AIK", label: "AIK" },
  { slug: "BK Häcken", label: "BK Häcken" },
  { slug: "Djurgårdens IF", label: "Djurgårdens IF" },
  { slug: "GAIS", label: "GAIS" },
  { slug: "Göteborg", label: "IFK Göteborg" },
  { slug: "Hammarby", label: "Hammarby IF" },
  { slug: "Helsingborg", label: "Helsingborgs IF" },
  { slug: "IF Elfsborg", label: "IF Elfsborg" },
  { slug: "IFK Norrköping", label: "IFK Norrköping" },
  { slug: "Kalmar FF", label: "Kalmar FF" },
  { slug: "Malmö FF", label: "Malmö FF" },
  { slug: "Mjällby AIF", label: "Mjällby AIF" },
  { slug: "Sirius", label: "IK Sirius" },
  { slug: "Värnamo", label: "IFK Värnamo" },
  { slug: "Örebro SK", label: "Örebro SK" },
  { slug: "Östersunds FK", label: "Östersunds FK" },
];

const EVENT_TYPES = [
  { value: "transfer", label: "Transfer" },
  { value: "injury", label: "Skada" },
  { value: "match_result", label: "Match" },
  { value: "general", label: "Kontroversi" },
  { value: "analysis", label: "Analys" },
  { value: "press_conference", label: "Presskonferens" },
];

const LS_KEY = "athopia_nyheter_filter";

// Lokalt alias + re-export för konsumenter
type FilterState = NewsFilterState;
export type { FilterState };

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
function Dropdown({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
          count > 0
            ? "border-pitch/60 bg-pitch/10 text-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
        )}
      >
        {label}
        {count > 0 && (
          <span className="bg-pitch text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
            {count}
          </span>
        )}
        <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-popover border border-border rounded-xl shadow-xl min-w-[180px] max-h-64 overflow-y-auto p-2">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
      <div
        className={clsx(
          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
          checked ? "bg-pitch border-pitch" : "border-border"
        )}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className={clsx("text-sm", checked ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </label>
  );
}

// ── Huvud-komponent ────────────────────────────────────────────────────────────
interface Props {
  allSources: { name: string; id: string }[];
  initialParams: Record<string, string>;
  totalCount: number;
}

const VISA_OPTS = [
  { value: "all", label: "Alla" },
  { value: "ai", label: "AI-summering" },
  { value: "source", label: "Källartiklar" },
] as const;

export function NewsFilterPanel({ allSources, initialParams, totalCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<FilterState>(() =>
    paramsToFilterState(new URLSearchParams(initialParams))
  );

  useEffect(() => {
    const urlState = paramsToFilterState(searchParams);
    if (isDefaultFilter(urlState)) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as FilterState;
          // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
          setFilter(parsed);
          const params = filterStateToParams(parsed);
          if (params.toString()) router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = useCallback(
    (next: FilterState) => {
      setFilter(next);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      const params = filterStateToParams(next);
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  const reset = () => applyFilter(DEFAULT_NEWS_FILTER);

  const activeCount =
    (filter.visa !== "all" ? 1 : 0) + filter.teams.length + filter.sources.length + filter.events.length;

  return (
    <div className="translucent-chrome sticky top-[57px] z-30 bg-background/90 backdrop-blur-sm border-b border-border -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Pill-tabs: Visa — riktiga länkar så de fungerar även före hydration */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          {VISA_OPTS.map((opt) => {
            const next = { ...filter, visa: opt.value };
            const params = filterStateToParams(next);
            return (
              <Link
                key={opt.value}
                href={params.toString() ? `${pathname}?${params.toString()}` : pathname}
                replace
                scroll={false}
                onClick={() => {
                  setFilter(next);
                  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
                }}
                className={clsx(
                  "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                  filter.visa === opt.value
                    ? "bg-pitch text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Lag dropdown */}
        <Dropdown label="Lag" count={filter.teams.length}>
          {ALLSVENSKAN_TEAMS.map((t) => (
            <CheckItem
              key={t.slug}
              checked={filter.teams.includes(t.slug)}
              onChange={() => applyFilter({ ...filter, teams: toggle(filter.teams, t.slug) })}
              label={t.label}
            />
          ))}
        </Dropdown>

        {/* Källor dropdown */}
        {allSources.length > 0 && (
          <Dropdown label="Källor" count={filter.sources.length}>
            {allSources.map((s) => (
              <CheckItem
                key={s.id}
                checked={filter.sources.includes(s.name)}
                onChange={() => applyFilter({ ...filter, sources: toggle(filter.sources, s.name) })}
                label={s.name}
              />
            ))}
          </Dropdown>
        )}

        {/* Eventtyp dropdown */}
        <Dropdown label="Eventtyp" count={filter.events.length}>
          {EVENT_TYPES.map((e) => (
            <CheckItem
              key={e.value}
              checked={filter.events.includes(e.value)}
              onChange={() => applyFilter({ ...filter, events: toggle(filter.events, e.value) })}
              label={e.label}
            />
          ))}
        </Dropdown>

        {/* Återställ */}
        {activeCount > 0 && (
          <button
            onClick={reset}
            className="ml-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Återställ
          </button>
        )}

        {/* Räknare */}
        <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
          {totalCount} artiklar
        </span>
      </div>
    </div>
  );
}
