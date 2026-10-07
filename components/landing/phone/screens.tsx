"use client";
/**
 * Telefonmockupen är en BILD av appen, inte appen: den har fast ljus
 * styling (text-zinc-900, divide-zinc-100) och ligger inuti landningssidans
 * mörka wrapper. Den temaväxlande accenten text-pitch-ink löses därför till
 * sin mörka valör på en ljus yta (2.5:1) — fel här, eftersom mockupens yta
 * aldrig växlar med temat. Den fasta pitch-dark ger 11.06:1 på #F2F3F1 och är
 * rätt här. Källkodsvakten i tests/e2e/contrast.spec.ts undantar denna mapp
 * explicit vid sökväg — smit aldrig förbi vakten med bracket-syntax i stället.
 */

import {
  Search,
  Home,
  CalendarDays,
  Compass,
  User,
  Plus,
  Heart,
  MessageCircle,
  Share2,
  ChevronRight,
  Bell,
} from "lucide-react";
import { StatusBar } from "./PhoneFrame";

/* Tre app-skärmar återskapade som riktiga komponenter (designbibeln):
   1. Hem    — hälsning, sök, glassiga nyhetskort, tab bar med FAB
   2. Match  — live-kort, engagement-rad, forumkort med avatarstack
   3. Utforska — kategori-pills, statuskort, mini-tabell
   Ljust glas-UI på 8px-grid, kortradie 20px, mjuka skuggor. */

// ── Delade bitar ──────────────────────────────────────────────────────────────

const card =
  "rounded-[20px] border border-white/60 bg-white/80 shadow-[0_8px_24px_-12px_rgba(24,40,33,0.18)] backdrop-blur-xl";

function Monogram({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-full text-[9px] font-bold text-white ${className}`}
    >
      {text}
    </div>
  );
}

function AvatarStack() {
  const tones = ["bg-pitch", "bg-sky-700", "bg-amber-700", "bg-rose-700"];
  return (
    <div className="flex -space-x-1.5">
      {["JL", "SK", "MA", "EB"].map((t, i) => (
        <Monogram key={t} text={t} className={`h-5 w-5 ring-2 ring-white ${tones[i]}`} />
      ))}
    </div>
  );
}

function TabBar({ active }: { active: "hem" | "matcher" | "utforska" | "profil" }) {
  const tabs = [
    { id: "hem", label: "Hem", Icon: Home },
    { id: "matcher", label: "Matcher", Icon: CalendarDays },
    { id: "fab", label: "", Icon: Plus },
    { id: "utforska", label: "Utforska", Icon: Compass },
    { id: "profil", label: "Profil", Icon: User },
  ] as const;

  return (
    <div className="absolute inset-x-3 bottom-3 z-10">
      <div className="flex items-end justify-between rounded-[26px] border border-white/70 bg-white/85 px-4 pb-2.5 pt-2 shadow-[0_12px_32px_-12px_rgba(24,40,33,0.3)] backdrop-blur-xl">
        {tabs.map(({ id, label, Icon }) =>
          id === "fab" ? (
            <div key={id} className="-mt-7 flex flex-col items-center">
              <div className="pitch-gradient flex h-12 w-12 items-center justify-center rounded-full shadow-[0_8px_20px_-4px_color-mix(in_srgb,var(--pitch)_50%,transparent)] ring-4 ring-[#F2F3F1]">
                <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
            </div>
          ) : (
            <div key={id} className="flex w-11 flex-col items-center gap-0.5 pt-1">
              <Icon
                className={`h-[18px] w-[18px] ${active === id ? "text-[var(--color-pitch-dark)]" : "text-zinc-600"}`}
                strokeWidth={active === id ? 2.4 : 2}
              />
              <span
                className={`text-[8px] font-semibold ${
                  active === id ? "text-[var(--color-pitch-dark)]" : "text-zinc-600"
                }`}
              >
                {label}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── 1. Hem / flöde ────────────────────────────────────────────────────────────

export function ScreenFeed() {
  const news = [
    { source: "Sportbladet", title: "Bergvall startar mot Häcken — Norling bekräftar", time: "18 min" },
    { source: "FotbollDirekt", title: "MFF nära att förlänga med mittbacken", time: "42 min" },
    { source: "Expressen", title: "Domarkrisen: så påverkas omgång 15", time: "1 tim" },
  ];

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex-1 overflow-hidden px-4 pt-2">
        {/* Hälsning */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium text-zinc-600">Tisdag 10 juni</p>
            <p className="font-sans text-[17px] font-bold tracking-tight text-zinc-900 text-balance">
              God kväll, Hampus
            </p>
          </div>
          <div className="relative">
            <Monogram text="H" className="pitch-gradient h-8 w-8 text-[11px]" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#F2F3F1]" />
          </div>
        </div>

        {/* Sök */}
        <div className={`mt-3 flex items-center gap-2 px-3.5 py-2.5 ${card}`}>
          <Search className="h-3.5 w-3.5 text-zinc-600" />
          <span className="text-[11px] text-zinc-600">Sök lag, spelare, nyheter…</span>
        </div>

        {/* Breaking-kort */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-900">Viktigast just nu</span>
          <span className="text-[10px] font-semibold text-[var(--color-pitch-dark)]">Visa alla</span>
        </div>
        <div className={`mt-2 overflow-hidden ${card}`}>
          <div className="pitch-gradient flex items-center justify-between px-3.5 py-1.5">
            <span className="text-[8px] font-bold uppercase tracking-[var(--tracking-badge)] text-white">
              Breaking
            </span>
            <span className="text-[8px] font-semibold text-white/80">Signal 0.94</span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[12.5px] font-bold leading-snug text-zinc-900">
              Isak-budet bekräftat av tre oberoende källor — rekord för Allsvenskan
            </p>
            <div className="mt-2.5 flex items-center justify-between">
              <AvatarStack />
              <span className="text-[9px] font-medium text-zinc-600">3 källor · 12 min sedan</span>
            </div>
          </div>
        </div>

        {/* Nyhetslista */}
        <div className="mt-3 flex flex-col gap-2">
          {news.map(({ source, title, time }) => (
            <div key={title} className={`flex items-start gap-2.5 px-3.5 py-2.5 ${card}`}>
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pitch" />
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-semibold leading-snug text-zinc-900">
                  {title}
                </p>
                <p className="mt-0.5 text-[9px] text-zinc-600">
                  {source} · {time} sedan
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TabBar active="hem" />
    </div>
  );
}

// ── 2. Matchdag / live ────────────────────────────────────────────────────────

export function ScreenMatch() {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex-1 overflow-hidden px-4 pt-2">
        <div className="flex items-center justify-between">
          <p className="font-sans text-[17px] font-bold tracking-tight text-zinc-900 text-balance">Matchdag</p>
          <span className={`px-2.5 py-1 text-[9px] font-semibold text-zinc-600 ${card}`}>
            Omgång 15
          </span>
        </div>

        {/* Live-kort */}
        <div className={`mt-3 overflow-hidden ${card}`}>
          <div className="flex items-center justify-between px-3.5 pt-3">
            <span className="flex items-center gap-1.5 text-[9px] font-bold text-rose-700">
              <span className="live-dot !h-1.5 !w-1.5" /> LIVE 73&prime;
            </span>
            <span className="text-[9px] font-medium text-zinc-600">Friends Arena</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex flex-col items-center gap-1.5">
              <Monogram text="AIK" className="h-9 w-9 bg-zinc-900 text-[8px]" />
              <span className="text-[9px] font-semibold text-zinc-600">AIK</span>
            </div>
            <div className="text-center">
              <p className="font-heading text-[30px] leading-none tracking-wider text-zinc-900">
                2–1
              </p>
              <p className="mt-1 text-[8px] font-medium text-zinc-600">Skott 12 – 7</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Monogram text="HIF" className="h-9 w-9 bg-emerald-700 text-[8px]" />
              <span className="text-[9px] font-semibold text-zinc-600">Hammarby</span>
            </div>
          </div>
          {/* Skott-bar */}
          <div className="px-5 pb-3">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="w-[66%] rounded-full bg-pitch" />
            </div>
          </div>
          {/* Engagement-rad */}
          <div className="flex items-center gap-4 border-t border-zinc-100 px-4 py-2.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-600">
              <Heart className="h-3 w-3 text-rose-500" fill="currentColor" /> 1,2k
            </span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-600">
              <MessageCircle className="h-3 w-3" /> 384
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-zinc-600">
              <Share2 className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Händelse-notis */}
        <div className={`mt-3 flex items-center gap-2.5 px-3.5 py-2.5 ${card}`}>
          <div className="pitch-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]">
            <Bell className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold text-zinc-900">Mål! Guidetti 2–1 (71&prime;)</p>
            <p className="text-[9px] text-zinc-600">Nano Fotboll · nu</p>
          </div>
        </div>

        {/* Forumkort */}
        <div className={`mt-3 px-3.5 py-3 ${card}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-zinc-900">AIK-forumet</span>
            <span className="rounded-full bg-pitch/10 px-2 py-0.5 text-[8px] font-bold text-[var(--color-pitch-dark)]">
              Taktiksnack
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-zinc-600">
            &ldquo;Bytet till 3-5-2 i paus vände hela pressspelet — håller ni med?&rdquo;
          </p>
          <div className="mt-2.5 flex items-center justify-between">
            <AvatarStack />
            <span className="text-[9px] font-semibold text-zinc-600">Matchtråden är igång</span>
          </div>
        </div>
      </div>

      <TabBar active="matcher" />
    </div>
  );
}

// ── 3. Utforska / filter ──────────────────────────────────────────────────────

export function ScreenExplore() {
  const pills = ["Alla", "Transfers", "Skador", "Statistik", "Rykten"];
  const table = [
    { pos: 1, team: "Malmö FF", short: "MFF", pts: 34, tone: "bg-sky-700" },
    { pos: 2, team: "AIK", short: "AIK", pts: 31, tone: "bg-zinc-900" },
    { pos: 3, team: "Hammarby", short: "HIF", pts: 29, tone: "bg-emerald-700" },
  ];

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex-1 overflow-hidden px-4 pt-2">
        <p className="font-sans text-[17px] font-bold tracking-tight text-zinc-900 text-balance">Utforska</p>

        {/* Kategori-pills */}
        <div className="mt-3 flex gap-1.5 overflow-hidden">
          {pills.map((p, i) => (
            <span
              key={p}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                i === 0
                  ? "pitch-gradient text-white shadow-[0_4px_12px_-2px_color-mix(in_srgb,var(--pitch)_45%,transparent)]"
                  : "border border-white/70 bg-white/80 text-zinc-600"
              }`}
            >
              {p}
            </span>
          ))}
        </div>

        {/* Statuskort 2-kolumn */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className={`overflow-hidden ${card}`}>
            <div className="flex h-14 items-center justify-center bg-gradient-to-br from-pitch/90 to-emerald-900">
              <span className="font-heading text-xl tracking-widest text-white">AI</span>
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[10px] font-bold leading-tight text-zinc-900">Isak → Premier League</p>
              <span className="mt-1.5 inline-block rounded-full bg-pitch/10 px-1.5 py-0.5 text-[8px] font-bold text-[var(--color-pitch-dark)]">
                Transfer · 92 %
              </span>
            </div>
          </div>
          <div className={`overflow-hidden ${card}`}>
            <div className="flex h-14 items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900">
              <span className="font-heading text-xl tracking-widest text-white">EB</span>
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[10px] font-bold leading-tight text-zinc-900">Berg tveksam till lördag</p>
              <span className="mt-1.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-800">
                Skada · Lindrig
              </span>
            </div>
          </div>
        </div>

        {/* Mini-tabell */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-900">Tabellen</span>
          <span className="flex items-center text-[10px] font-semibold text-[var(--color-pitch-dark)]">
            Se alla <ChevronRight className="h-3 w-3" />
          </span>
        </div>
        <div className={`mt-2 divide-y divide-zinc-100 ${card}`}>
          {table.map(({ pos, team, short, pts, tone }) => (
            <div key={team} className="flex items-center gap-2.5 px-3.5 py-2">
              <span className="w-3 text-[10px] font-bold text-zinc-600">{pos}</span>
              <Monogram text={short} className={`h-6 w-6 text-[7px] ${tone}`} />
              <span className="flex-1 text-[11px] font-semibold text-zinc-800">{team}</span>
              <span className="font-heading text-[15px] tracking-wider text-zinc-900">{pts}</span>
            </div>
          ))}
        </div>
      </div>

      <TabBar active="utforska" />
    </div>
  );
}
