/**
 * app/lag/[slug]/analys — Lagets analysyta.
 *
 * Nano Fotbolls enda AI-analys som produceras i skala är `entity_insights` (~16/dygn).
 * Före den här sidan visades två av dem inne i en flik på laghubben; motorn
 * fungerade men produkten dolde den. Ytan ger analysen den plats produktbriefen
 * kräver: dagens viktigaste först, sedan tidslinjen, med synligt underlag.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getTeamHub } from "@/lib/team-hub/queries";
import { getTeamAnalysis, getArticleRefs } from "@/lib/supabase";
import { getTeamAISummaries, getTeamNarratives } from "@/lib/team-hub/analysis";
import { AnalysisCard, type ArticleRef } from "@/components/team-hub/AnalysisCard";
import { NarrativeCard } from "@/components/ui/NarrativeCard";
import { PaywallGate } from "@/components/PaywallGate";
import { getUserPlan } from "@/lib/user-plan";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hub = await getTeamHub(slug);
  const name = hub?.team.name ?? slug;
  return {
    title: `${name} — Analys | Nano Fotboll`,
    description: `Nano Fotbolls egna analyser om ${name}: form, nyhetsläge och statistik i sammanhang.`,
    alternates: { canonical: `${getSiteUrl()}/lag/${slug}/analys` },
  };
}

/** Dagens viktigaste = starkast signal bland de senaste 48 timmarna. */
function pickLead<T extends { severity: string; confidence: number; generatedAt: string }>(
  items: T[],
): T | null {
  const cutoff = Date.now() - 48 * 3600_000;
  const recent = items.filter((i) => new Date(i.generatedAt).getTime() >= cutoff);
  const pool = recent.length > 0 ? recent : items.slice(0, 1);
  if (pool.length === 0) return null;
  const rank = (s: string) => (s === "strong" ? 2 : s === "watch" ? 1 : 0);
  return [...pool].sort(
    (a, b) => rank(b.severity) - rank(a.severity) || b.confidence - a.confidence,
  )[0]!;
}

export default async function LagAnalysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hub = await getTeamHub(slug);
  if (!hub) notFound();

  const plan = await getUserPlan();
  const [insights, narratives, summaries] = await Promise.all([
    getTeamAnalysis(hub.team.id, 40),
    getTeamNarratives(hub.team.id),
    plan !== "free" ? getTeamAISummaries(hub.team.name) : Promise.resolve([]),
  ]);

  const lead = pickLead(insights);
  const rest = lead ? insights.filter((i) => i.id !== lead.id) : insights;

  // Bara ledarens underlag hämtas — resten av korten visar inga källor, så en
  // query räcker. (Undviker N+1 över 40 kort.)
  const leadSources: ArticleRef[] = lead ? await getArticleRefs(lead.sourceArticleIds) : [];

  const isEmpty = insights.length === 0 && narratives.length === 0 && summaries.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-12">
      <ProductEventTracker
        event="team_analysis_opened"
        props={{ team_slug: slug, team_id: hub.team.id, count: insights.length }}
      />

      <AppBreadcrumbs
        items={[
          { label: "Allsvenskan", href: "/allsvenskan" },
          { label: hub.team.name, href: `/lag/${slug}` },
          { label: "Analys" },
        ]}
      />

      <header className="mt-3 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-pitch-ink inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Nano Fotbolls egen analys
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground mt-1 text-balance">
          {hub.team.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vi läser statistiken mot nyhetsläget och skriver ut vad det betyder. Ingen
          återpublicering av andras text.
        </p>
      </header>

      {isEmpty ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen analys publicerad för {hub.team.name} ännu. Nya analyser genereras
            löpande när det finns tillräckligt underlag.
          </p>
          <Link
            href={`/lag/${slug}/nyheter`}
            className="mt-4 inline-block text-sm text-pitch-ink hover:underline"
          >
            Läs lagets nyheter under tiden →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {lead && (
            <section aria-labelledby="lead-heading">
              <h2
                id="lead-heading"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 text-balance"
              >
                Viktigast just nu
              </h2>
              <AnalysisCard insight={lead} sources={leadSources} lead />
            </section>
          )}

          {summaries.length > 0 && (
            <section aria-labelledby="summary-heading">
              <h2
                id="summary-heading"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 text-balance"
              >
                Nano Fotbolls sammanfattning
              </h2>
              <PaywallGate feature="aiSummaries" plan={plan} teamName={hub.team.name}>
                <div className="flex flex-col gap-3">
                  {summaries.map((a) => (
                    <article key={a.id} className="rounded-2xl border border-pitch/30 bg-pitch/5 p-5">
                      <h3 className="font-semibold text-lg text-foreground text-balance">{a.title}</h3>
                      <div className="text-sm text-foreground/90 mt-2 whitespace-pre-line">
                        {a.content ?? a.summary}
                      </div>
                    </article>
                  ))}
                </div>
              </PaywallGate>
            </section>
          )}

          {narratives.length > 0 && (
            <section aria-labelledby="narrative-heading">
              <h2
                id="narrative-heading"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 text-balance"
              >
                Synteser · flera källor
              </h2>
              <div className="flex flex-col gap-3">
                {narratives.map((n) => (
                  <NarrativeCard key={n.id} narrative={n} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="rest-heading">
              <h2
                id="rest-heading"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 text-balance"
              >
                Tidigare analyser
              </h2>
              <div className="flex flex-col gap-3">
                {rest.map((i) => (
                  <AnalysisCard key={i.id} insight={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
