/**
 * app/analys/page.tsx — Matchanalyser (lista)
 * ─────────────────────────────────────────────────────────────────────────────
 * Minsta möjliga ingång till de publicerade matchanalyserna (post_match_analysis)
 * som tidigare bara var nåbara direkt via /analys/[id]-url — ingen yta länkade dit.
 * Server component, ISR 60s. Listar bara status='published' (garanteras av
 * getPostMatchAnalyses i lib/supabase.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getPostMatchAnalyses } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Matchanalyser | Nano Fotboll",
  description: "AI-genererade matchanalyser för Allsvenskan — xG, pressure och form jämfört med senaste matcherna.",
  alternates: { canonical: `${getSiteUrl()}/analys` },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: `${getSiteUrl()}/analys`,
    title: "Matchanalyser | Nano Fotboll",
    description: "AI-genererade matchanalyser för Allsvenskan.",
  },
};

export default async function AnalysListPage() {
  const analyses = await getPostMatchAnalyses(30);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-3">
        Nano Fotboll AI
      </p>
      <h1 className="font-bold text-3xl sm:text-4xl text-foreground mb-2 leading-tight text-balance">
        Matchanalyser
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Djupdykningar efter varje match — xG, pressure och form jämfört med de tre senaste matcherna.
      </p>

      {analyses.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          <p>Inga matchanalyser publicerade ännu — Nano Fotboll AI skriver en efter varje match.</p>
          <Link href="/match" className="mt-2 inline-block text-pitch-ink hover:underline">
            Se kommande matcher →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {analyses.map((a) => (
            <Link
              key={a.id}
              href={`/analys/${a.id}`}
              className="group flex flex-col gap-1.5 px-5 py-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-pitch-ink shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-pitch-ink line-clamp-2">
                  {a.title}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {a.matchName && <span>{a.matchName}</span>}
                {a.playedAt && (
                  <>
                    {a.matchName && <span>·</span>}
                    <time dateTime={a.playedAt}>
                      {new Date(a.playedAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
