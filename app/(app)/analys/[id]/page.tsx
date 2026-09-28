/**
 * app/analys/[id]/page.tsx — Matchanalys (post_match_analysis)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fri teaser (title + summary). Full fact pack bakom PRO via BlurPaywall
 * (full body aldrig i free-DOM). xG/pressure visas ENDAST när metadata.comparisons
 * har riktiga värden — aldrig 0.00/påhittat.
 * Läser articles där status='published' och metadata->>type='post_match_analysis'
 * (skrivs av athopia-os post-match-analysis-agenten, godkänns i athopia-admin).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getPostMatchAnalysis } from "@/lib/supabase";
import { getUserPlan } from "@/lib/user-plan";
import { BlurPaywall } from "@/components/BlurPaywall";
import { jsonLd } from "@/lib/json-ld";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const analysis = await getPostMatchAnalysis(id);
  if (!analysis) return { title: "Matchanalys | Nano Fotboll" };

  return {
    title: analysis.title,
    description: analysis.summary,
    alternates: { canonical: `${getSiteUrl()}/analys/${analysis.id}` },
    openGraph: {
      type: "article",
      title: analysis.title,
      description: analysis.summary,
      url: `${getSiteUrl()}/analys/${analysis.id}`,
      publishedTime: analysis.publishedAt,
    },
    twitter: { card: "summary", title: analysis.title },
  };
}

function statRow(label: string, home: number | null, away: number | null, decimals = 2) {
  if (home === null && away === null) return null;
  return (
    <div key={label} className="flex justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
      <span className="font-medium text-white font-mono tabular-nums">{home != null ? home.toFixed(decimals) : "—"}</span>
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-white font-mono tabular-nums">{away != null ? away.toFixed(decimals) : "—"}</span>
    </div>
  );
}

export default async function AnalysPage({ params }: PageProps) {
  const { id } = await params;
  const analysis = await getPostMatchAnalysis(id);
  if (!analysis) notFound();

  const plan = await getUserPlan();
  const [home, away] = analysis.comparisons;

  const analysisJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: analysis.title,
    description: analysis.summary,
    datePublished: analysis.publishedAt,
    author: { "@type": "Organization", name: "Nano Fotboll AI" },
    publisher: { "@type": "Organization", name: "Nano Fotboll" },
    url: `${getSiteUrl()}/analys/${analysis.id}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(analysisJsonLd) }} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-3">
          Nano Fotboll AI · Matchanalys
        </p>

        <h1 className="font-bold text-3xl sm:text-4xl text-white mb-3 leading-tight text-balance">
          {analysis.title}
        </h1>

        <p className="text-sm text-zinc-400 mb-8">
          {analysis.matchName ?? "Allsvenskan"}
          {analysis.playedAt && (
            <>
              {" · "}
              <time dateTime={analysis.playedAt}>
                {new Date(analysis.playedAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </>
          )}
        </p>

        {/* Fri teaser — alltid synlig (kort) */}
        <div className="rounded-xl p-5 mb-8 border border-emerald-500/30 bg-emerald-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400 uppercase tracking-wider">
              Sammanfattning
            </span>
          </div>
          <p className="text-white/90 leading-relaxed">{analysis.summary}</p>
        </div>

        {/* Fact pack — PRO; full body aldrig i free-DOM */}
        <BlurPaywall
          feature="aiSummaries"
          plan={plan}
          maxHeight="6rem"
          tease="Djupanalys och matchjämförelse — PRO."
          preview={
            <p className="text-sm text-white/70 line-clamp-3">
              {(analysis.body ?? analysis.summary).slice(0, 160)}…
            </p>
          }
        >
          <div className="space-y-6">
            {analysis.body && (
              <div className="prose prose-invert max-w-none whitespace-pre-line text-white/90 leading-relaxed">
                {analysis.body}
              </div>
            )}

            {(home || away) && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3 text-balance">
                  Jämfört med senaste 3 matcherna
                </h2>
                <div className="flex justify-between text-xs text-zinc-500 mb-2">
                  <span>{home?.team ?? ""}</span>
                  <span>{away?.team ?? ""}</span>
                </div>
                {statRow("xG", home?.current.xg ?? null, away?.current.xg ?? null)}
                {statRow("Pressure Index", home?.current.pressure ?? null, away?.current.pressure ?? null, 1)}
                {statRow("Bollinnehav", home?.current.possession ?? null, away?.current.possession ?? null, 0)}
                {statRow("Skott", home?.current.shots ?? null, away?.current.shots ?? null, 0)}
                {statRow("Skott på mål", home?.current.shots_on_target ?? null, away?.current.shots_on_target ?? null, 0)}

                {(home?.readable.length || away?.readable.length) ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-zinc-300">
                    <ul className="space-y-1">
                      {(home?.readable ?? []).map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                    <ul className="space-y-1">
                      {(away?.readable ?? []).map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </BlurPaywall>

        <div className="mt-12">
          <Link href="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
            ← Tillbaka till startsidan
          </Link>
        </div>
      </div>
    </>
  );
}
