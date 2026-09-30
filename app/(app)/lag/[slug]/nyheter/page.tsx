import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/ui/ArticleCard";
import { createServerClient, isSupabaseConfigured, mapArticle } from "@/lib/supabase";
import type { Article } from "@/lib/types";
import { Newspaper } from "lucide-react";
import { SPORT } from "@/lib/vertical";
import { getSiteUrl } from "@/lib/site-url";
import { contentCutoffIso } from "@/lib/content-window";

export const dynamic = 'force-dynamic';


async function getTeam(slug: string): Promise<{ id: string; name: string } | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("entities")
      .select("id,name")
      .eq("slug", slug)
      .eq("type", "team")
      .eq("sport", SPORT)
      .maybeSingle();
    return data ? { id: String(data.id), name: String(data.name) } : null;
  } catch {
    return null;
  }
}

async function getTeamArticles(teamId: string): Promise<Article[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("sport", SPORT)
      .contains("entity_ids", [teamId])
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(24);
    return (data ?? []).map(mapArticle);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeam(slug);
  const name = team?.name ?? slug;
  return {
    title: `${name} Nyheter – Allsvenskan 2026`,
    description: `Senaste nyheterna om ${name} i Allsvenskan 2026 — matcher, transferer och matchanalyser.`,
    alternates: { canonical: `${getSiteUrl()}/lag/${slug}/nyheter` },
  };
}

export default async function LagNyheterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await getTeam(slug);
  const teamName = team?.name ?? slug;
  const articles = team ? await getTeamArticles(team.id) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-bold text-3xl text-foreground mb-6 text-balance">
        NYHETER — {teamName.toUpperCase()}
      </h1>

      {articles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Newspaper className="w-10 h-10 opacity-30" />
          <p className="max-w-sm text-center text-sm text-balance">
            Här samlas allt skrivet om {teamName}. Inget har publicerats det
            senaste dygnet — <Link href="/nyheter" className="underline">se hela nyhetsflödet</Link> under tiden.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Korten är h3. Utan sektionsrubriken hoppade sidan h1 → h3. */}
          <h2 className="sr-only">Artiklar</h2>
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} size="md" />
          ))}
        </div>
      )}
    </div>
  );
}
