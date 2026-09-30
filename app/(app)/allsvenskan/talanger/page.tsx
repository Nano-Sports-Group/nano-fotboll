import { SPORT, VERTICAL, leagueHref, vertical } from "@/lib/vertical";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";

export const revalidate = 3600;

const TITLE =
  VERTICAL === "hockey"
    ? "SHL U21 2026/27 – speltid och poäng"
    : "Allsvenskans främsta U21-talanger 2026 – speltid & poäng";
const CANONICAL =
  `${getSiteUrl()}${leagueHref("/talanger")}`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    VERTICAL === "hockey"
      ? "Unga spelare i SHL visas när statistiken finns. Inga utfyllnadssiffror."
      : "De mest tongivande unga spelarna i Allsvenskan 2026: U21-spelare rankade på speltid, mål och assist. Vem är ligans nästa stjärna?",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: CANONICAL,
    title: VERTICAL === "hockey" ? "SHL U21 2026/27" : "Allsvenskans främsta U21-talanger 2026",
    description:
      VERTICAL === "hockey"
        ? "U21 i SHL när underlaget finns."
        : "Unga spelare rankade på speltid, mål och assist i Allsvenskan 2026.",
  },
};

interface Talent {
  playerId: number;
  name: string;
  slug: string | null;
  age: number;
  minutes: number;
  goals: number;
  assists: number;
  teamName: string | null;
  teamSlug: string | null;
}

const fetchTalents = unstable_cache(
  async (): Promise<Talent[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const db = createServerClient();
      const { data: season } = await db
        .from("seasons").select("sportmonks_id").eq("sport", SPORT).eq("is_current", true).maybeSingle();
      if (!season?.sportmonks_id) return [];

      const { data: rows } = await db
        .from("player_season_stats")
        .select("player_id, team_id, minutes, goals, assists, players!inner(fullname, slug, birthdate)")
        .eq("season_id", season.sportmonks_id)
        .gt("minutes", 150);
      if (!rows?.length) return [];

      // Slug-map per team_id — dedupas (entities har dubblettrader för vissa lag)
      const teamIds = [...new Set(rows.map((r) => Number(r.team_id)).filter(Boolean))];
      const [{ data: ents }, { data: teams }] = await Promise.all([
        db.from("entities").select("sportmonks_id, slug").eq("type", "team").in("sportmonks_id", teamIds).not("slug", "is", null),
        db.from("teams").select("sportmonks_id, name").in("sportmonks_id", teamIds),
      ]);
      const slugBy = new Map<number, string>();
      for (const e of ents ?? []) if (!slugBy.has(Number(e.sportmonks_id))) slugBy.set(Number(e.sportmonks_id), String(e.slug));
      const nameBy = new Map((teams ?? []).map((t) => [Number(t.sportmonks_id), String(t.name)]));

      const cutoff = new Date("2026-07-01");
      const seen = new Set<number>();
      const out: Talent[] = [];
      for (const r of rows) {
        const p = (r as { players?: { fullname?: string; slug?: string; birthdate?: string } }).players;
        if (!p?.birthdate) continue;
        const age = Math.floor((cutoff.getTime() - new Date(p.birthdate).getTime()) / (365.25 * 864e5));
        if (age > 21) continue;
        const pid = Number(r.player_id);
        if (seen.has(pid)) continue; // dedup fan-out
        seen.add(pid);
        out.push({
          playerId: pid,
          name: p.fullname ?? "Okänd",
          slug: p.slug ?? null,
          age,
          minutes: Number(r.minutes ?? 0),
          goals: Number(r.goals ?? 0),
          assists: Number(r.assists ?? 0),
          teamName: nameBy.get(Number(r.team_id)) ?? null,
          teamSlug: slugBy.get(Number(r.team_id)) ?? null,
        });
      }
      return out
        .sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.minutes - a.minutes)
        .slice(0, 25);
    } catch {
      return [];
    }
  },
  ["u21-talents", SPORT],
  { revalidate: 3600, tags: ["statistik"] }
);

export default async function TalangerPage() {
  const talents = await fetchTalents();

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: "Talanger" },
          ]}
        />
      </div>

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">U21-TALANGERNA</h1>
      <p className="text-muted-foreground mb-8 max-w-xl">
        {VERTICAL === "hockey"
          ? "Unga spelare i SHL, när statistiken finns."
          : "Allsvenskans mest tongivande unga spelare 2026, rankade på mål + assist och speltid."}
        Alla 21 år eller yngre med minst 150 spelade minuter.
      </p>

      {talents.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-muted-foreground">
          Talangdatan kunde inte hämtas just nu.
        </p>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left py-3 px-4 font-medium w-8">#</th>
                <th className="text-left py-3 px-4 font-medium">Spelare</th>
                <th className="text-center py-3 px-2 font-medium">Ålder</th>
                <th className="text-center py-3 px-2 font-medium">Min</th>
                <th className="text-center py-3 px-2 font-medium">M</th>
                <th className="text-center py-3 px-3 font-medium">A</th>
              </tr>
            </thead>
            <tbody>
              {talents.map((t, i) => (
                <tr key={t.playerId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-mono tabular-nums">{i + 1}</td>
                  <td className="py-3 px-4">
                    {t.slug ? (
                      <Link href={`/spelare/${t.slug}`} className="font-medium hover:text-pitch-ink transition-colors">{t.name}</Link>
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                    {t.teamName && (
                      <span className="block text-xs text-muted-foreground">
                        {t.teamSlug ? <Link href={`/lag/${t.teamSlug}`} className="hover:text-pitch-ink">{t.teamName}</Link> : t.teamName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-center text-muted-foreground font-mono tabular-nums">{t.age}</td>
                  <td className="py-3 px-2 text-center text-muted-foreground font-mono tabular-nums">{t.minutes}</td>
                  <td className="py-3 px-2 text-center font-semibold text-foreground font-mono tabular-nums">{t.goals}</td>
                  <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{t.assists}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex gap-4 text-sm">
        <Link href={`${vertical.leaguePath}/skytteliga`} className="text-pitch-ink hover:underline">Skytteligan →</Link>
        <Link href={`${vertical.leaguePath}/xp-tabell`} className="text-pitch-ink hover:underline">xP-tabellen →</Link>
      </div>
    </div>
  );
}
