import type { Metadata } from "next";
import { getProjectionRows, getScheduleFormRows, getClutchRows } from "@/lib/stats/advanced";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { StatistikTabs } from "./StatistikTabs";
import { FavoriteTeamHighlight } from "./FavoriteTeamHighlight";
import { H2HSearch } from "./H2HSearch";
import { PlayerStatsExplorer } from "./PlayerStatsExplorer";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import type { H2HFixture } from "./H2HSearch";
import {
  fetchAllsvenskanFixtures,
  parseFixtureScore,
} from "@/lib/db/fixtures";
import { jsonLd } from "@/lib/json-ld";
import { formLetter, formLabel } from "@/lib/form-letter";
import {
  SEASON_IDS,
  type ScorerRow,
  getStandingsFromDb,
  getTopScorersFromDb,
  getTopAssistsFromDb,
  getTopXgFromDb,
  getTopRatingsFromDb,
  getTopShotsFromDb,
  getTopPassersFromDb,
  getTopDefendersFromDb,
  getMostCardsFromDb,
  getAllPlayerStatsFromDb,
} from "@/lib/statistik";
import { getSiteUrl } from "@/lib/site-url";

// Data hämtas från Supabase (synkad av athopia-os från Sportmonks).
async function getStandings(seasonId: string) {
  return getStandingsFromDb(seasonId);
}
async function getScorers(seasonId: string) {
  return getTopScorersFromDb(seasonId);
}
async function getAssists(seasonId: string) {
  return getTopAssistsFromDb(seasonId);
}
async function getXgLeaders(seasonId: string) {
  return getTopXgFromDb(seasonId);
}
async function getPlayerOverview(seasonId: string) {
  const [ratings, shots, passers, defenders, cards, allPlayers] = await Promise.all([
    getTopRatingsFromDb(seasonId),
    getTopShotsFromDb(seasonId),
    getTopPassersFromDb(seasonId),
    getTopDefendersFromDb(seasonId),
    getMostCardsFromDb(seasonId),
    getAllPlayerStatsFromDb(seasonId),
  ]);
  return { ratings, shots, passers, defenders, cards, allPlayers };
}

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Allsvenskan-statistik 2026 – Skytteliga, Tabell & Mer",
  description:
    "Allsvenskan-statistik — tabell, skytteliga, assistligan, skott, passningar, form och H2H.",
};

function StatistikBreadcrumb() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Hem", item: `${getSiteUrl()}` },
        { "@type": "ListItem", position: 2, name: "Statistik", item: `${getSiteUrl()}/statistik` },
      ],
    })}} />
  );
}

type TabId = "tabell" | "skytteliga" | "assistligan" | "xg" | "form" | "press" | "h2h" | "projektion" | "luck" | "clutch";
const VALID_TABS: TabId[] = ["tabell", "skytteliga", "assistligan", "xg", "form", "press", "h2h", "projektion", "luck", "clutch"];

const VALID_SEASONS = Object.keys(SEASON_IDS);

// ── Delade komponenter ────────────────────────────────────────────────────────

function EmptyState({ message = "Ingen data för vald säsong ännu." }: { message?: string }) {
  return (
    <div className="text-center py-20 text-muted-foreground">
      <p className="text-sm">{message}</p>
      <p className="text-xs mt-1 opacity-60">
        Data synkroniseras — prova igen om en stund.
      </p>
    </div>
  );
}

function FormBadge({ result }: { result: string }) {
  // Datat är engelskt (W/D/L); produkten är svensk.
  const colorMap: Record<string, string> = {
    W: "bg-success text-success-foreground",
    D: "bg-muted text-muted-foreground",
    L: "bg-red-500/20 text-destructive-ink",
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
        colorMap[result] ?? "bg-muted text-muted-foreground"
      }`}
      title={formLabel(result)}
      aria-label={formLabel(result)}
    >
      {formLetter(result)}
    </span>
  );
}

function TeamCell({ name, image }: { name: string; image?: string }) {
  return (
    <div className="flex items-center gap-2">
      {image ? (
        <Image
          src={image}
          alt={name}
          width={20}
          height={20}
          className="rounded-full shrink-0"
          unoptimized
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
      )}
      <span className="truncate max-w-[110px] sm:max-w-[180px]">{name}</span>
    </div>
  );
}

function PlayerCell({ row }: { row: ScorerRow }) {
  const href = row.slug ? `/spelare/${row.slug}` : undefined;
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      {row.image ? (
        <Image
          src={row.image}
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full object-cover bg-muted"
          unoptimized
        />
      ) : (
        <div className="size-8 rounded-full bg-muted" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{row.player_name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.team_name}{row.position ? ` · ${row.position}` : ""}
        </span>
      </span>
    </div>
  );

  return href ? (
    <Link href={href} className="hover:text-pitch-ink">
      {content}
    </Link>
  ) : content;
}

function fmt(value: number | null | undefined, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return "–";
  return decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(Number(value)));
}

function PlayerLeaderboard({
  rows,
  primary,
  primaryLabel,
  primaryDecimals = 0,
  secondary,
}: {
  rows: ScorerRow[];
  primary: keyof ScorerRow;
  primaryLabel: string;
  primaryDecimals?: number;
  secondary?: Array<{ key: keyof ScorerRow; label: string; decimals?: number }>;
}) {
  if (rows.length === 0) return <EmptyState message="Listan rankar spelarna i Allsvenskan — den fylls på när säsongens matcher är spelade." />;
  const cols = secondary ?? [
    { key: "appearances", label: "M" },
    { key: "minutes", label: "Min" },
    { key: "goals", label: "Mål" },
    { key: "assists", label: "Ast" },
    { key: "rating", label: "Betyg", decimals: 2 },
  ];

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
            <th className="py-2 px-3 text-left w-10">#</th>
            <th className="py-2 px-3 text-left min-w-[240px]">Spelare</th>
            {cols.map((col) => (
              <th key={String(col.key)} className="py-2 px-3 text-center">{col.label}</th>
            ))}
            <th className="py-2 px-3 text-center font-bold text-foreground">{primaryLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row) => (
            <tr key={`${row.player_id}-${row.rank}`} className="border-b border-border/40 hover:bg-card/50 transition-colors">
              <td className="py-3 px-3 text-xs font-semibold font-mono tabular-nums text-muted-foreground">{row.rank}</td>
              <td className="py-3 px-3"><PlayerCell row={row} /></td>
              {cols.map((col) => (
                <td key={String(col.key)} className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">
                  {fmt(row[col.key] as number | null, col.decimals)}
                </td>
              ))}
              <td className="py-3 px-3 text-center text-lg font-bold font-mono tabular-nums text-foreground">
                {fmt(row[primary] as number | null, primaryDecimals)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabell ────────────────────────────────────────────────────────────────────

async function TabelTab({ seasonId }: { seasonId: string }) {
  const rows = await getStandings(seasonId);
  if (rows.length === 0) return <EmptyState message="Tabellen visar ställningen i Allsvenskan — den skrivs så snart första omgången är spelad." />;
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
            <th className="py-2 px-3 text-left w-8">#</th>
            <th className="py-2 px-3 text-left min-w-[140px]">Lag</th>
            <th className="py-2 px-3 text-center">M</th>
            <th className="py-2 px-3 text-center">V</th>
            <th className="py-2 px-3 text-center">O</th>
            <th className="py-2 px-3 text-center">F</th>
            <th className="py-2 px-3 text-center hidden sm:table-cell">Mål</th>
            <th className="py-2 px-3 text-center">+/-</th>
            <th className="py-2 px-3 text-center font-bold text-foreground">P</th>
            <th className="py-2 px-3 text-center hidden md:table-cell">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.team.id}
              data-team-slug={row.team.slug ?? ""}
              className={`border-b border-border/40 hover:bg-card/50 transition-colors ${
                i < 3 ? "text-foreground" : ""
              }`}
            >
              <td className="py-3 px-3">
                <span
                  className={`text-xs font-semibold font-mono tabular-nums ${
                    i < 3 ? "text-pitch-ink" : "text-muted-foreground"
                  }`}
                >
                  {row.position}
                </span>
              </td>
              <td className="py-3 px-3 font-medium">
                <TeamCell name={row.team.name} image={row.team.image_path || undefined} />
              </td>
              <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.played}</td>
              <td className="py-3 px-3 text-center font-mono tabular-nums">{row.wins}</td>
              <td className="py-3 px-3 text-center font-mono tabular-nums">{row.draws}</td>
              <td className="py-3 px-3 text-center font-mono tabular-nums">{row.losses}</td>
              <td className="py-3 px-3 text-center text-muted-foreground hidden sm:table-cell font-mono tabular-nums">
                {row.goals_for}–{row.goals_against}
              </td>
              <td
                className={`py-3 px-3 text-center font-medium font-mono tabular-nums ${
                  row.goal_diff > 0
                    ? "text-success"
                    : row.goal_diff < 0
                    ? "text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {row.goal_diff > 0 ? "+" : ""}
                {row.goal_diff}
              </td>
              <td className="py-3 px-3 text-center font-bold font-mono tabular-nums">{row.points}</td>
              <td className="py-3 px-3 hidden md:table-cell">
                <div className="flex items-center gap-0.5">
                  {row.form.map((r, idx) => (
                    <FormBadge key={idx} result={r} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Skytteliga ────────────────────────────────────────────────────────────────

async function SkytteligaTab({ seasonId }: { seasonId: string }) {
  const scorers = await getScorers(seasonId);
  return <PlayerLeaderboard rows={scorers} primary="goals" primaryLabel="Mål" />;
}

// ── Assistligan ───────────────────────────────────────────────────────────────

async function AssistliganTab({ seasonId }: { seasonId: string }) {
  const assists = await getAssists(seasonId);
  return <PlayerLeaderboard rows={assists} primary="assists" primaryLabel="Ast" />;
}

// ── xG-tabell ────────────────────────────────────────────────────────────────

async function XGTab({ seasonId }: { seasonId: string }) {
  const rows = await getXgLeaders(seasonId);
  if (rows.length === 0) {
    return (
      <EmptyState message="xG-data saknas för nuvarande säsong — uppdateras när data finns." />
    );
  }
  return (
    <PlayerLeaderboard
      rows={rows}
      primary="xg"
      primaryLabel="xG"
      primaryDecimals={2}
      secondary={[
        { key: "goals", label: "Mål" },
        { key: "shots", label: "Skott" },
        { key: "minutes", label: "Min" },
        { key: "rating", label: "Betyg", decimals: 2 },
      ]}
    />
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

async function FormTab({ seasonId }: { seasonId: string }) {
  const rows = await getStandings(seasonId);
  if (rows.length === 0) return <EmptyState message="Formtabellen visar de fem senaste matcherna per lag — den kräver spelade omgångar." />;
  const withForm = rows.filter((r) => r.form.length > 0);
  if (withForm.length === 0)
    return <EmptyState message="Formdata ej tillgänglig för säsongen." />;

  const sorted = [...withForm].sort((a, b) => {
    const ptsA = a.form
      .slice(-5)
      .reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
    const ptsB = b.form
      .slice(-5)
      .reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
    return ptsB - ptsA;
  });

  return (
    <ListGroup className="max-w-2xl" footer="Sorterat på poäng de senaste 5 omgångarna.">
      {sorted.map((row) => {
        const last5 = row.form.slice(-5);
        const pts = last5.reduce(
          (sum, r) => sum + (r === "W" ? 3 : r === "D" ? 1 : 0),
          0
        );
        return (
          <ListRow
            key={row.team.id}
            title={<TeamCell name={row.team.name} image={row.team.image_path || undefined} />}
            trailing={
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  {last5.map((r, i) => (
                    <FormBadge key={i} result={r} />
                  ))}
                </span>
                <span className="text-xs font-mono tabular-nums text-muted-foreground w-12 text-right">{pts}/15 p</span>
              </span>
            }
          />
        );
      })}
    </ListGroup>
  );
}

// ── Press ─────────────────────────────────────────────────────────────────────

async function PressTab({ seasonId }: { seasonId: string }) {
  const { ratings, shots, passers, defenders, cards, allPlayers } = await getPlayerOverview(seasonId);
  return (
    <div className="space-y-8">
      <PlayerStatsExplorer players={allPlayers} />
      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground text-balance">Högst betyg</h2>
        <PlayerLeaderboard rows={ratings} primary="rating" primaryLabel="Betyg" primaryDecimals={2} />
      </section>
      <div className="grid gap-8 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground text-balance">Flest skott</h2>
          <PlayerLeaderboard rows={shots} primary="shots" primaryLabel="Skott" />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground text-balance">Flest passningar</h2>
          <PlayerLeaderboard rows={passers} primary="passes" primaryLabel="Pass" />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground text-balance">Flest tacklingar</h2>
          <PlayerLeaderboard rows={defenders} primary="tackles" primaryLabel="Tackl" />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground text-balance">Kort</h2>
          <PlayerLeaderboard
            rows={cards}
            primary="yellow_cards"
            primaryLabel="Gula"
            secondary={[
              { key: "red_cards", label: "Röda" },
              { key: "appearances", label: "M" },
              { key: "minutes", label: "Min" },
              { key: "rating", label: "Betyg", decimals: 2 },
            ]}
          />
        </section>
      </div>
    </div>
  );
}

// ── H2H ───────────────────────────────────────────────────────────────────────

async function H2HTab() {
  const fixtures = await fetchAllsvenskanFixtures().catch(() => []);
  const h2hFixtures: H2HFixture[] = fixtures.map((f) => {
    const { home, away, homeGoals, awayGoals } = parseFixtureScore(f);
    return {
      id: f.id,
      date: f.starting_at,
      home_team: home?.name ?? "Okänt",
      away_team: away?.name ?? "Okänt",
      home_goals: homeGoals,
      away_goals: awayGoals,
      name: f.name ?? "",
      state: f.state?.state ?? "",
    };
  });
  return <H2HSearch fixtures={h2hFixtures} />;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-12 bg-card rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

// ── Projektion ────────────────────────────────────────────────────────────────

async function ProjektionTab() {
  const rows = await getProjectionRows();
  if (rows.length === 0) return <EmptyState message="Projektion beräknas kl 05:00 — inga simuleringar ännu." />;
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Vi simulerar resten av säsongen 10 000 gånger utifrån lagens styrka. Siffrorna visar hur ofta varje lag vann titeln, tog topp-3 eller åkte ur.</p>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
              <th className="py-2 px-3 text-left">Lag</th>
              <th className="py-2 px-3 text-center">Poäng</th>
              <th className="py-2 px-3 text-center">Elo</th>
              <th className="py-2 px-3 text-center text-success font-bold">Titel %</th>
              <th className="py-2 px-3 text-center">Topp 3 %</th>
              <th className="py-2 px-3 text-center text-red-400">Nedflyttning %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId} className="border-b border-border/40 hover:bg-card/50 transition-colors">
                <td className="py-3 px-3 font-medium">{r.teamName}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums">{r.points}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums text-muted-foreground">{r.elo}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-success">{(r.pChampion * 100).toFixed(1)}%</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums">{(r.pTop3 * 100).toFixed(1)}%</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums text-red-400">{(r.pRelegation * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tur/otur (schema-form) ────────────────────────────────────────────────────

async function LuckTab() {
  const rows = await getScheduleFormRows();
  if (rows.length === 0) return <EmptyState message="Schema-form beräknas kl 05:00 — inga data ännu." />;
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">xP är förväntade poäng baserat på motståndarnas styrka. Positivt &quot;tur&quot; betyder laget tagit fler poäng än svårighetsgraden motiverar.</p>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
              <th className="py-2 px-3 text-left">Lag</th>
              <th className="py-2 px-3 text-center">Faktiska P</th>
              <th className="py-2 px-3 text-center">xP</th>
              <th className="py-2 px-3 text-center font-bold">Tur/Otur</th>
              <th className="py-2 px-3 text-center">Schemastyrka (Elo)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const luck = r.luck ?? 0;
              return (
                <tr key={r.teamId} className="border-b border-border/40 hover:bg-card/50 transition-colors">
                  <td className="py-3 px-3 font-medium">{r.teamName}</td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums">{r.actualPoints}</td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums text-muted-foreground">{r.xpts != null ? r.xpts.toFixed(1) : "–"}</td>
                  <td className={`py-3 px-3 text-center font-mono tabular-nums font-bold ${luck > 0 ? "text-success" : luck < 0 ? "text-red-400" : ""}`}>
                    {luck > 0 ? "+" : ""}{luck.toFixed(1)}
                  </td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums text-muted-foreground">{r.sos ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Clutch ────────────────────────────────────────────────────────────────────

async function ClutchTab() {
  const rows = await getClutchRows();
  if (rows.length === 0) return <EmptyState message="Clutch-index beräknas kl 05:00 — inga data ännu." />;
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Inte alla mål är lika mycket värda. Mål bakifrån eller vid oavgjort väger tyngre. Clutch-poäng mäter hur avgörande en spelares mål faktiskt var.</p>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
              <th className="py-2 px-3 text-left w-10">#</th>
              <th className="py-2 px-3 text-left">Spelare</th>
              <th className="py-2 px-3 text-center">Mål</th>
              <th className="py-2 px-3 text-center">Bakifrån</th>
              <th className="py-2 px-3 text-center">Vid oavgjort</th>
              <th className="py-2 px-3 text-center font-bold text-foreground">Clutch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b border-border/40 hover:bg-card/50 transition-colors">
                <td className="py-3 px-3 text-xs font-semibold font-mono tabular-nums text-muted-foreground">{r.rank}</td>
                <td className="py-3 px-3">
                  <span className="font-medium">{r.playerName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.teamName}</span>
                </td>
                <td className="py-3 px-3 text-center font-mono tabular-nums">{r.goals}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums text-pitch-ink">{r.trailingGoals}</td>
                <td className="py-3 px-3 text-center font-mono tabular-nums">{r.levelGoals}</td>
                <td className="py-3 px-3 text-center text-lg font-bold font-mono tabular-nums text-foreground">{r.clutchScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const tab = (VALID_TABS.includes(sp.tab as TabId) ? sp.tab : "tabell") as TabId;
  const sasong = VALID_SEASONS.includes(sp.sasong ?? "") ? sp.sasong! : "2026";
  const seasonId = SEASON_IDS[sasong]!;

  let tabContent: React.ReactNode;
  switch (tab) {
    case "tabell":      tabContent = <TabelTab seasonId={seasonId} />;       break;
    case "skytteliga":  tabContent = <SkytteligaTab seasonId={seasonId} />;  break;
    case "assistligan": tabContent = <AssistliganTab seasonId={seasonId} />; break;
    case "xg":          tabContent = <XGTab seasonId={seasonId} />;          break;
    case "form":        tabContent = <FormTab seasonId={seasonId} />;        break;
    case "press":       tabContent = <PressTab seasonId={seasonId} />;       break;
    case "h2h":         tabContent = <H2HTab />;              break;
    case "projektion":  tabContent = <ProjektionTab />;        break;
    case "luck":        tabContent = <LuckTab />;              break;
    case "clutch":      tabContent = <ClutchTab />;            break;
  }

  return (
    <div>
      <StatistikBreadcrumb />
      {/* Sticky tab-nav + filter */}
      <Suspense
        fallback={
          <div className="sticky top-[57px] z-30 border-b border-border bg-background/95 h-[61px]" />
        }
      >
        <StatistikTabs />
      </Suspense>

      {/* Client-side lag-highlight */}
      <FavoriteTeamHighlight />

      {/* Innehåll */}
      <div className="w-full px-6 sm:px-8 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-bold text-3xl text-foreground text-balance">Statistik</h1>
            <p className="text-muted-foreground mt-1 text-sm">Allsvenskan {sasong}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/statistik/scout"
              className="px-4 py-2 rounded-lg border border-pitch text-pitch-ink text-sm font-medium hover:bg-pitch/10 transition-colors"
            >
              Scout Mode →
            </Link>
            <Link
              href="/statistik/spelare"
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Jämför spelare →
            </Link>
            <Link
              href="/statistik/jamfor"
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Jämför lag →
            </Link>
          </div>
        </div>
        <Suspense fallback={<TabSkeleton />}>{tabContent}</Suspense>
      </div>
    </div>
  );
}
