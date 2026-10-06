import { smFixtureHref } from "@/lib/match/slug";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { fetchTeamsWithSlugs, fetchH2HFixtures, type SMTeam } from "@/lib/db/fixtures";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 3600;

/** Kanonisk URL: slugs i svensk alfabetisk ordning, "aik-vs-hammarby". */
function canonicalMatchup(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, "sv")).join("-vs-");
}

async function resolveTeams(matchup: string): Promise<{ a: SMTeam; b: SMTeam } | "redirect" | null> {
  const idx = matchup.indexOf("-vs-");
  if (idx === -1) return null;
  const slugA = matchup.slice(0, idx);
  const slugB = matchup.slice(idx + 4);
  if (!slugA || !slugB || slugA === slugB) return null;
  const teams = await fetchTeamsWithSlugs();
  const a = teams.find((t) => t.slug === slugA);
  const b = teams.find((t) => t.slug === slugB);
  if (!a || !b) return null;
  if (canonicalMatchup(slugA, slugB) !== matchup) return "redirect";
  return { a, b };
}

export async function generateStaticParams() {
  const teams = await fetchTeamsWithSlugs();
  const slugs = teams.map((t) => t.slug).filter((s): s is string => !!s);
  const params: { matchup: string }[] = [];
  for (let i = 0; i < slugs.length; i++)
    for (let j = i + 1; j < slugs.length; j++)
      params.push({ matchup: canonicalMatchup(slugs[i], slugs[j]) });
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchup: string }>;
}): Promise<Metadata> {
  const { matchup } = await params;
  const resolved = await resolveTeams(matchup);
  if (!resolved || resolved === "redirect") return { title: "Möte hittades inte" };
  const { a, b } = resolved;
  return {
    title: `${a.name} – ${b.name}: Inbördes möten, statistik & H2H`,
    description: `Alla inbördes möten mellan ${a.name} och ${b.name} i Allsvenskan — resultat, statistik och nästa match.`,
    alternates: { canonical: `${getSiteUrl()}/allsvenskan/moten/${matchup}` },
    openGraph: {
      type: "website",
      locale: "sv_SE",
      url: `${getSiteUrl()}/allsvenskan/moten/${matchup}`,
      title: `${a.name} – ${b.name} | Inbördes möten`,
      description: `H2H-statistik och alla möten mellan ${a.name} och ${b.name}.`,
    },
  };
}

export default async function MotenPage({
  params,
}: {
  params: Promise<{ matchup: string }>;
}) {
  const { matchup } = await params;
  const resolved = await resolveTeams(matchup);
  if (!resolved) notFound();
  if (resolved === "redirect") {
    const idx = matchup.indexOf("-vs-");
    permanentRedirect(`/allsvenskan/moten/${canonicalMatchup(matchup.slice(0, idx), matchup.slice(idx + 4))}`);
  }
  const { a, b } = resolved;
  const fixtures = await fetchH2HFixtures(a.id, b.id);

  const played = fixtures.filter((f) => f.state.short_name === "FT");
  const upcoming = fixtures.filter((f) => f.state.short_name !== "FT").reverse();

  let winsA = 0, winsB = 0, draws = 0, goalsA = 0, goalsB = 0;
  for (const f of played) {
    const home = f.participants.find((p) => p.meta.location === "home");
    const hg = f.scores.find((s) => s.score.participant === "home")?.score.goals ?? 0;
    const ag = f.scores.find((s) => s.score.participant === "away")?.score.goals ?? 0;
    const aIsHome = home?.id === a.id;
    const gA = aIsHome ? hg : ag;
    const gB = aIsHome ? ag : hg;
    goalsA += gA; goalsB += gB;
    if (gA > gB) winsA++; else if (gB > gA) winsB++; else draws++;
  }

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <AppBreadcrumbs
          items={[
            { label: "Allsvenskan", href: "/allsvenskan" },
            { label: `${a.name} – ${b.name}` },
          ]}
        />
      </div>

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">
        {a.name.toUpperCase()} – {b.name.toUpperCase()}
      </h1>
      <p className="text-muted-foreground mb-8">Inbördes möten i Allsvenskan.</p>

      <div className="grid grid-cols-3 gap-3 mb-8 text-center">
        <div className="rounded-2xl border border-border bg-card py-4">
          <div className="text-3xl font-bold text-foreground">{winsA}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <Link href={`/lag/${a.slug}`} className="hover:text-pitch-ink">{a.name}</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card py-4">
          <div className="text-3xl font-bold text-foreground">{draws}</div>
          <div className="text-xs text-muted-foreground mt-1">Oavgjorda</div>
        </div>
        <div className="rounded-2xl border border-border bg-card py-4">
          <div className="text-3xl font-bold text-foreground">{winsB}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <Link href={`/lag/${b.slug}`} className="hover:text-pitch-ink">{b.name}</Link>
          </div>
        </div>
      </div>

      {played.length > 0 && (
        <p className="text-sm text-muted-foreground mb-8">
          {played.length} spelade möten i databasen. Målskillnad: {a.name} {goalsA} – {goalsB} {b.name}.
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 text-balance">Kommande möten</h2>
          <MatchList fixtures={upcoming} />
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 text-balance">Spelade möten</h2>
        {played.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-muted-foreground">
            Inga spelade möten i databasen ännu.
          </p>
        ) : (
          <MatchList fixtures={played} />
        )}
      </section>
    </div>
  );
}

function MatchList({ fixtures }: { fixtures: Awaited<ReturnType<typeof fetchH2HFixtures>> }) {
  return (
    <ul className="rounded-2xl border border-border divide-y divide-border/50 overflow-hidden">
      {fixtures.map((f) => {
        const home = f.participants.find((p) => p.meta.location === "home");
        const away = f.participants.find((p) => p.meta.location === "away");
        const hg = f.scores.find((s) => s.score.participant === "home")?.score.goals;
        const ag = f.scores.find((s) => s.score.participant === "away")?.score.goals;
        const played = f.state.short_name === "FT";
        return (
          <li key={f.id} className="hover:bg-muted/20 transition-colors">
            <Link href={smFixtureHref(f)} className="flex items-center justify-between px-4 py-3 gap-3">
              <span className="flex-1 text-right font-medium text-foreground truncate">{home?.name}</span>
              <span className={`px-3 py-1 rounded-lg text-sm font-bold font-mono tabular-nums ${played ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
                {played && hg != null && ag != null
                  ? `${hg} – ${ag}`
                  : new Date(f.starting_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" })}
              </span>
              <span className="flex-1 font-medium text-foreground truncate">{away?.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
