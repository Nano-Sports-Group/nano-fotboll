import { smFixtureHref } from "@/lib/match/slug";
import { vertical } from "@/lib/vertical";
import Link from "next/link";
import Image from "next/image";
import {
  fetchLiveScores,
  fetchAllsvenskanFixtures,
  fetchStandingsFull,
  type SMFixture,
  type SMStandingRow,
} from "@/lib/db/fixtures";
import { isKickoffToday } from "@/lib/matchday/helpers";
import { ScoreWidget } from "@/components/ui/ScoreWidget";
import type { LandingArticle } from "./AthopiaLanding";

/**
 * SportFront — det utloggade skyltfönstret: live/kommande matcher, tabell-
 * snapshot och senaste nytt. Det metadata/JSON-LD på startsidan alltid lovat.
 * Server component; renderas som slot i AthopiaLanding direkt efter hero.
 */

function relTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 60) return `${Math.max(diffMin, 1)} min sedan`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} tim sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" });
}

function SectionHeading({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide text-white text-balance">{title}</h2>
      <Link href={href} className="text-sm text-pitch-ink hover:underline shrink-0">
        {linkLabel} →
      </Link>
    </div>
  );
}

export async function SportFront({ articles }: { articles: LandingArticle[] }) {
  const [live, fixtures, standings] = await Promise.all([
    fetchLiveScores(),
    fetchAllsvenskanFixtures(),
    fetchStandingsFull(),
  ]);

  // eslint-disable-next-line react-hooks/purity -- Server Component: körs en gång per request, hydreras aldrig.
  const now = Date.now();
  const todaysFixtures = fixtures
    .filter(
      (f) =>
        f.state?.short_name === "LIVE" ||
        isKickoffToday(f.starting_at) ||
        (f.state?.short_name === "FT" && isKickoffToday(f.starting_at))
    )
    .sort((a, b) => new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime());
  const upcoming = fixtures
    .filter((f) => f.state?.short_name === "NS" && new Date(f.starting_at).getTime() >= now)
    .slice(0, 4);
  const recent = fixtures
    .filter((f) => f.state?.short_name === "FT")
    .sort((a, b) => new Date(b.starting_at).getTime() - new Date(a.starting_at).getTime())
    .slice(0, 4);

  const matchList: { heading: string; items: SMFixture[]; live?: boolean } | null =
    todaysFixtures.length > 0
      ? {
          heading: todaysFixtures.some((f) => f.state?.short_name === "LIVE")
            ? "● Matchdag idag"
            : "Matchdag idag",
          items: todaysFixtures,
          live: todaysFixtures.some((f) => f.state?.short_name === "LIVE"),
        }
      : live.length > 0
        ? { heading: "Live nu", items: live, live: true }
        : upcoming.length > 0
          ? { heading: "Kommande matcher", items: upcoming }
          : recent.length > 0
            ? { heading: "Senaste resultaten", items: recent }
            : null;

  const top = standings.slice(0, 6);

  if (!matchList && top.length === 0 && articles.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Matchcenter */}
        {matchList && (
          <div className="lg:col-span-3">
            <SectionHeading
              title={matchList.live ? "● Live nu" : matchList.heading}
              href="/match"
              linkLabel="Alla matcher"
            />
            <div className="flex flex-col gap-2">
              {matchList.items.map((f) => (
                <Link key={f.id} href={smFixtureHref(f)}>
                  <ScoreWidget fixture={f} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tabell-snapshot */}
        {top.length > 0 && (
          <div className={matchList ? "lg:col-span-2" : "lg:col-span-5"}>
            <SectionHeading title="Tabellen" href={`${vertical.leaguePath}/tabell`} linkLabel="Hela tabellen" />
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              {top.map((row: SMStandingRow) => (
                <Link
                  key={row.team.id}
                  href={`/lag/${row.team.slug ?? ""}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.05] transition-colors"
                >
                  <span className="w-5 text-sm text-zinc-400 font-mono tabular-nums">{row.position}</span>
                  {row.team.image_path ? (
                    <Image src={row.team.image_path} alt="" width={20} height={20} className="shrink-0" />
                  ) : (
                    <span className="w-5" />
                  )}
                  <span className="flex-1 text-sm text-white truncate">{row.team.name}</span>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums hidden sm:inline">{row.played} sp</span>
                  <span className="text-sm font-semibold text-white font-mono tabular-nums">{row.points}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Senaste nytt */}
      {articles.length > 0 && (
        <div>
          <SectionHeading title="Senaste nytt" href="/nyheter" linkLabel="Alla nyheter" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {articles.slice(0, 6).map((a) => (
              <Link
                key={a.id}
                href={`/artikel/${a.slug}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-pitch/50 transition-colors"
              >
                <p className="text-[15px] font-medium text-white leading-snug line-clamp-3 group-hover:text-pitch-ink transition-colors">
                  {a.title}
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  {a.sourceName}
                  {a.publishedAt ? ` · ${relTime(a.publishedAt)}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lagval-CTA */}
      <div className="rounded-2xl border border-pitch/30 bg-pitch/10 px-6 py-8 text-center">
        <h2 className="font-display text-2xl uppercase tracking-wide text-white text-balance">Välj ditt lag</h2>
        <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
          Följ din klubb och få nyheter, matcher, statistik och forum — samlat på ett ställe.
        </p>
        <Link
          href="/onboarding"
          className="mt-5 inline-block rounded-xl bg-pitch px-6 py-3 text-sm font-semibold text-white hover:bg-pitch/90 transition-colors"
        >
          Kom igång gratis
        </Link>
      </div>
    </section>
  );
}
