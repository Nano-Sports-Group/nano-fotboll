import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  getTeamCompareAnalysis,
  getTeamCompareStats,
  type TeamCompareStats,
} from "@/lib/statistik/team-compare";
import { TeamSearchBar } from "./TeamSearchBar";
import { SPORT, vertical } from "@/lib/vertical";

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { a, b } = await searchParams;
  if (a && b) {
    return {
      title: `${a} vs ${b} — Statistikjämförelse | Nano Fotboll`,
      description: `Form, H2H och nyckelstatistik för ${a} och ${b} i Allsvenskan.`,
    };
  }
  return {
    title: "Statistikjämförelse | Nano Fotboll",
    description: "Jämför Allsvenskan-lag sida vid sida — form, H2H och nyckeltal.",
  };
}

// ── Datahämtning ───────────────────────────────────────────────────────────────

async function getTeamList(): Promise<{ name: string; slug: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data } = await db
    .from("entities")
    .select("name, slug")
    .eq("type", "team")
    .eq("sport", SPORT).in("metadata->>league", [...vertical.leagueEntities])
    .not("slug", "is", null)
    .order("name");
  return (data ?? []) as { name: string; slug: string }[];
}

// ── Stat-rad ──────────────────────────────────────────────────────────────────

function StatRow({
  label,
  a,
  b,
  higherIsBetter = true,
}: {
  label: string;
  a: number;
  b: number;
  higherIsBetter?: boolean;
}) {
  const aWins = higherIsBetter ? a > b : a < b;
  const bWins = higherIsBetter ? b > a : b < a;

  return (
    <div className="grid grid-cols-3 items-center py-2 border-b border-border/40 last:border-0">
      <span
        className={`text-sm font-semibold text-right pr-4 ${aWins ? "text-success" : "text-foreground"}`}
      >
        {a}
      </span>
      <span className="text-xs text-center text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-semibold text-left pl-4 ${bWins ? "text-foreground" : "text-foreground"}`}
      >
        {b}
      </span>
    </div>
  );
}

function FormRow({ label, a, b }: { label: string; a: string[]; b: string[] }) {
  const Badge = ({ r }: { r: string }) => {
    const color =
      r === "W" ? "bg-success text-success-foreground" : r === "D" ? "bg-muted text-muted-foreground" : "bg-red-500/20 text-destructive-ink";
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${color}`}>
        {r}
      </span>
    );
  };
  return (
    <div className="grid grid-cols-3 items-center py-2 border-b border-border/40 last:border-0">
      <div className="flex gap-1 justify-end pr-4">
        {a.length ? a.map((r, i) => <Badge key={i} r={r} />) : <span className="text-xs text-muted-foreground">—</span>}
      </div>
      <span className="text-xs text-center text-muted-foreground">{label}</span>
      <div className="flex gap-1 pl-4">
        {b.length ? b.map((r, i) => <Badge key={i} r={r} />) : <span className="text-xs text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

// ── Sida ──────────────────────────────────────────────────────────────────────

export default async function JamforPage({ searchParams }: PageProps) {
  const { a: slugA, b: slugB } = await searchParams;
  const teams = await getTeamList();

  let statsA: TeamCompareStats | null = null;
  let statsB: TeamCompareStats | null = null;
  let aiAnalysis: string | null = null;

  if (slugA && slugB && slugA !== slugB) {
    [statsA, statsB, aiAnalysis] = await Promise.all([
      getTeamCompareStats(slugA),
      getTeamCompareStats(slugB),
      getTeamCompareAnalysis(slugA, slugB),
    ]);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1
          // "STATISTIKJÄMFÖRELSE" är ett enda obrytbart ord: i text-4xl blir det
          // 405px brett och sköt ut sidan i sidled på 390px-skärmar.
          className="text-3xl sm:text-4xl font-bold text-foreground mb-1 text-balance"
          style={{ fontFamily: "var(--font-display)" }}
        >
          STATISTIKJÄMFÖRELSE
        </h1>
        <p className="text-muted-foreground text-sm">
          Form, tabelläge och nyckeltal sida vid sida.
        </p>
      </div>

      {/* Sök-bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <Suspense fallback={null}>
          <TeamSearchBar teams={teams} />
        </Suspense>
      </div>

      {/* Inget valt */}
      {(!slugA || !slugB) && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Välj två lag att jämföra</p>
          <p className="text-sm mt-1">Välj lag A och lag B i formuläret ovan.</p>
        </div>
      )}

      {/* Resultat */}
      {statsA && statsB && (
        <div className="space-y-6">
          {/* Lagrubriker */}
          <div className="grid grid-cols-3 text-center">
            <div>
              <p className="text-2xl font-bold text-pitch-ink" style={{ fontFamily: "var(--font-display)" }}>
                {statsA.name}
              </p>
              {statsA.position > 0 && (
                <p className="text-xs text-muted-foreground">#{statsA.position} i tabellen</p>
              )}
            </div>
            <div className="flex items-center justify-center">
              <span className="text-muted-foreground font-bold text-xl">vs</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {statsB.name}
              </p>
              {statsB.position > 0 && (
                <p className="text-xs text-muted-foreground">#{statsB.position} i tabellen</p>
              )}
            </div>
          </div>

          {/* Nyckeltal */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 text-balance">
              Nyckeltal
            </h2>
            <StatRow label="Poäng" a={statsA.points} b={statsB.points} />
            <StatRow label="Spelade" a={statsA.played} b={statsB.played} higherIsBetter={false} />
            <StatRow label="Vinster" a={statsA.won} b={statsB.won} />
            <StatRow label="Oavgjorda" a={statsA.drawn} b={statsB.drawn} />
            <StatRow label="Förluster" a={statsA.lost} b={statsB.lost} higherIsBetter={false} />
            <StatRow label="Mål gjorda" a={statsA.goalsFor} b={statsB.goalsFor} />
            <StatRow label="Mål insläppta" a={statsA.goalsAgainst} b={statsB.goalsAgainst} higherIsBetter={false} />
            <StatRow label="Målskillnad" a={statsA.goalDiff} b={statsB.goalDiff} />
            <FormRow label="Form (5 sista)" a={statsA.form} b={statsB.form} />
          </div>

          {/* AI-analys */}
          {aiAnalysis ? (
            <div className="bg-card border border-pitch/30 rounded-xl p-4">
              <p className="text-xs text-pitch-ink font-semibold uppercase tracking-wide mb-2">
                Vår AI-analys
              </p>
              <p className="text-sm text-foreground leading-relaxed">{aiAnalysis}</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                AI-analys
              </p>
              <p className="text-sm text-muted-foreground italic">
                AI-jämförelse genereras automatiskt när tillräcklig match-data finns tillgänglig.
              </p>
            </div>
          )}

          {/* Ingen data */}
          {statsA.played === 0 && statsB.played === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Ingen match-data i databasen än. Kör OS-17 (match-collector) för att samla statistik.
            </p>
          )}
        </div>
      )}

      {/* Lag hittades ej */}
      {slugA && slugB && (!statsA || !statsB) && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Kunde inte hitta statistik för ett eller båda lag.</p>
          <p className="text-xs mt-1">Kontrollera att lagen finns i Supabase entities-tabellen.</p>
        </div>
      )}
    </div>
  );
}
