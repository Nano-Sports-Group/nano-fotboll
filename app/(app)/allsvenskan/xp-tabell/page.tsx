import { SPORT, VERTICAL, leagueHref, vertical } from "@/lib/vertical";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { fetchStandingsFull } from "@/lib/db/fixtures";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";

export const revalidate = 3600;

const TITLE =
  VERTICAL === "hockey"
    ? "SHL xP-tabell 2026/27 – Förväntade poäng"
    : "Allsvenskan xP-tabell 2026 – Förväntade poäng utifrån xG";
const CANONICAL =
  `${getSiteUrl()}${leagueHref("/xp-tabell")}`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    VERTICAL === "hockey"
      ? "xP-tabellen för SHL visas när matchdata finns. Inga utfyllnadssiffror."
      : "Vilka lag över- och underpresterar? xP-tabellen räknar förväntade poäng per match utifrån expected goals (xG) för hela Allsvenskan 2026.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: CANONICAL,
    title: VERTICAL === "hockey" ? "SHL xP-tabell 2026/27" : "Allsvenskan xP-tabell 2026 – Förväntade poäng",
    description:
      VERTICAL === "hockey"
        ? "Förväntade poäng i SHL när underlaget finns."
        : "Förväntade poäng per lag utifrån xG — vem över- och underpresterar i Allsvenskan?",
  },
};

/** Poisson-sannolikhet för k mål givet xG. */
function pois(k: number, lambda: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / f;
}

/** Förväntade poäng (hemmalag, bortalag) för en match utifrån xG. */
function xPoints(xgH: number, xgA: number): [number, number] {
  let pH = 0, pD = 0, pA = 0;
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = pois(h, Math.max(xgH, 0.01)) * pois(a, Math.max(xgA, 0.01));
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
  }
  return [3 * pH + pD, 3 * pA + pD];
}

interface XpRow {
  teamId: number;
  xp: number;
  matches: number;
}

/** Lag-xG per match aggregeras från player_match_stats (100% täckning verifierad). */
const fetchXpTable = unstable_cache(
  async (): Promise<XpRow[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const db = createServerClient();
      const { data: season } = await db
        .from("seasons").select("sportmonks_id").eq("sport", SPORT).eq("is_current", true).maybeSingle();
      if (!season?.sportmonks_id) return [];

      const { data: fixtures } = await db
        .from("fixtures")
        .select("sportmonks_id, home_team_id, away_team_id")
        .eq("sport", SPORT)
        .eq("season_id", season.sportmonks_id)
        .eq("status", "FT");
      if (!fixtures?.length) return [];

      const ids = fixtures.map((f) => Number(f.sportmonks_id));
      const { data: pms } = await db
        .from("player_match_stats")
        .select("fixture_id, team_id, xg")
        .in("fixture_id", ids)
        .not("xg", "is", null);

      const teamXg = new Map<string, number>(); // `${fixture}:${team}` → xG
      for (const r of pms ?? []) {
        const k = `${r.fixture_id}:${r.team_id}`;
        teamXg.set(k, (teamXg.get(k) ?? 0) + Number(r.xg ?? 0));
      }

      const acc = new Map<number, XpRow>();
      const add = (teamId: number, xp: number) => {
        const row = acc.get(teamId) ?? { teamId, xp: 0, matches: 0 };
        row.xp += xp;
        row.matches += 1;
        acc.set(teamId, row);
      };
      for (const f of fixtures) {
        const xgH = teamXg.get(`${f.sportmonks_id}:${f.home_team_id}`);
        const xgA = teamXg.get(`${f.sportmonks_id}:${f.away_team_id}`);
        if (xgH == null || xgA == null) continue; // ärlig frånvaro — hoppa matcher utan xG
        const [xpH, xpA] = xPoints(xgH, xgA);
        add(Number(f.home_team_id), xpH);
        add(Number(f.away_team_id), xpA);
      }
      return [...acc.values()];
    } catch {
      return [];
    }
  },
  ["xp-table", SPORT],
  { revalidate: 3600, tags: ["standings"] }
);

export default async function XpTabellPage() {
  const [xpRows, standings] = await Promise.all([fetchXpTable(), fetchStandingsFull()]);
  const xpByTeam = new Map(xpRows.map((r) => [r.teamId, r]));

  const rows = standings
    .map((s) => {
      const xp = xpByTeam.get(s.team.id);
      return { ...s, xp: xp?.xp ?? null, diff: xp ? s.points - xp.xp : null };
    })
    .sort((a, b) => (b.xp ?? -1) - (a.xp ?? -1));

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: "xP-tabell" },
          ]}
        />
      </div>

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">XP-TABELLEN</h1>
      <p className="text-muted-foreground mb-8 max-w-xl">
        Förväntade poäng utifrån xG per match (Poisson-modell). Grönt = laget har tagit fler
        poäng än chanserna motiverar, rött = färre. Nano Fotbolls beräkning på synkad matchdata.
      </p>

      {/* Se /allsvenskan/tabell: hidden klippte bort P−xP, sidans hela poäng. */}
      <div className="rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium w-8">#</th>
              <th className="text-left py-3 px-4 font-medium">Lag</th>
              <th className="text-center py-3 px-3 font-medium">M</th>
              <th className="text-center py-3 px-3 font-medium">xP</th>
              <th className="text-center py-3 px-3 font-medium">P</th>
              <th className="text-center py-3 px-4 font-medium">P−xP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">xP-datan kunde inte hämtas just nu.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.team.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 text-muted-foreground font-mono tabular-nums">{i + 1}</td>
                <td className="py-3 px-4">
                  <Link href={`/lag/${r.team.slug ?? ""}`} className="font-medium hover:text-pitch-ink transition-colors">
                    {r.team.name}
                  </Link>
                </td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{r.played}</td>
                <td className="py-3 px-3 text-center font-semibold text-foreground font-mono tabular-nums">
                  {r.xp != null ? r.xp.toFixed(1) : "–"}
                </td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{r.points}</td>
                <td className={`py-3 px-4 text-center font-bold font-mono tabular-nums ${
                  r.diff == null ? "text-muted-foreground" : r.diff > 1 ? "text-success" : r.diff < -1 ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {r.diff != null ? (r.diff > 0 ? `+${r.diff.toFixed(1)}` : r.diff.toFixed(1)) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex gap-4 text-sm">
        <Link href={`${vertical.leaguePath}/tabell`} className="text-pitch-ink hover:underline">Vanliga tabellen →</Link>
        <Link href="/statistik" className="text-pitch-ink hover:underline">All statistik →</Link>
      </div>
    </div>
  );
}
