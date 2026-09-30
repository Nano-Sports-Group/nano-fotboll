import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient, isSupabaseConfigured, mapNarrative } from "@/lib/supabase";
import { SPORT } from "@/lib/vertical";
import type { Narrative } from "@/lib/types";
import { TrendBadge } from "@/components/ui/TrendBadge";
import { SentimentBar } from "@/components/ui/SentimentBar";
import { Separator } from "@/components/ui/separator";

export const dynamic = 'force-dynamic';

async function getNarrative(id: string): Promise<(Narrative & { articleIds: string[] }) | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from("narratives").select("*").eq("id", id).eq("sport", SPORT).maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      ...mapNarrative(row),
      updatedAt: String(row.updated_at ?? row.last_updated_at ?? row.created_at ?? new Date().toISOString()),
      articleIds: Array.isArray(row.article_ids) ? (row.article_ids as string[]) : [],
    };
  } catch {
    return null;
  }
}

type SourceArticle = {
  id: string;
  title: string;
  slug: string | null;
  source_name: string | null;
  published_at: string | null;
};

async function getSourceArticles(articleIds: string[]): Promise<SourceArticle[]> {
  if (!articleIds.length || !isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("id, title, slug, source_name, published_at")
      .eq("sport", SPORT)
      .in("id", articleIds.slice(0, 20))
      .order("published_at", { ascending: false });
    return (data ?? []) as SourceArticle[];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const narrative = await getNarrative(id);
  if (!narrative) return { title: "Narrativ hittades inte" };
  return {
    title: narrative.topic,
    description: `Vad pratas det om just nu? ${narrative.topic}`,
    openGraph: {
      title: `${narrative.topic} | Nano Fotboll`,
      description: `Narrativ med score ${Math.round(narrative.score * 100)}%`,
    },
  };
}

export default async function NarrativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const narrative = await getNarrative(id);
  if (!narrative) notFound();
  const sources = await getSourceArticles(narrative.articleIds);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-bold text-5xl text-foreground mb-3 text-balance">{narrative.topic}</h1>
      {narrative.description && (
        <p className="mb-6 max-w-3xl text-lg leading-8 text-muted-foreground">{narrative.description}</p>
      )}
      <div className="flex items-center gap-3 mb-6">
        <TrendBadge trend={narrative.trend} />
        <span className="text-sm text-muted-foreground">{Math.round(narrative.score * 100)}%</span>
        <span className="text-sm text-muted-foreground">{narrative.sourceCount} källor</span>
      </div>

      <Separator className="mb-6" />

      {typeof narrative.sentimentScore === "number" && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="text-sm text-muted-foreground mb-3">Sentiment</div>
          <SentimentBar score={narrative.sentimentScore} />
        </div>
      )}

      {narrative.body ? (
        <article className="prose prose-invert max-w-none text-foreground">
          {narrative.body.split("\n\n").map((paragraph) => (
            <p key={paragraph.slice(0, 80)} className="text-base leading-8 text-foreground/90">
              {paragraph}
            </p>
          ))}
        </article>
      ) : (
        <p className="text-muted-foreground">
          Det här narrativet saknar brödtext just nu — se källartiklarna nedan.
        </p>
      )}

      {sources.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4 text-balance">
            Källartiklar ({sources.length})
          </h2>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/20 transition-colors">
                {s.slug ? (
                  <Link href={`/artikel/${s.slug}`} className="font-medium text-foreground hover:text-pitch-ink transition-colors">
                    {s.title}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{s.title}</span>
                )}
                <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                  {s.source_name && <span>{s.source_name}</span>}
                  {s.published_at && (
                    <time dateTime={s.published_at}>
                      {new Date(s.published_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" })}
                    </time>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
