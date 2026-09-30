"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { ArticleCard } from "@/components/ui/ArticleCard";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@supabase/supabase-js";
import type { Article } from "@/lib/types";
import { SPORT } from "@/lib/vertical";
import { contentCutoffIso } from "@/lib/content-window";

function useTeamArticles(teamSlug: string | null): { articles: Article[]; loading: boolean } {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    if (!url || !key) { setLoading(false); return; }

    const db = createClient(url, key);
    setLoading(true);

    const query = teamSlug
      ? db
          .from("articles")
          .select("*")
          .contains("entity_ids", [teamSlug])
          .eq("sport", SPORT)
          .gte("published_at", contentCutoffIso())
          .order("published_at", { ascending: false })
          .limit(4)
      : db
          .from("articles")
          .select("*")
          .eq("sport", SPORT)
          .gte("published_at", contentCutoffIso())
          .order("published_at", { ascending: false })
          .limit(6);

    void query.then(({ data }) => {
      setArticles((data as Article[] | null) ?? []);
      setLoading(false);
    });
  }, [teamSlug]);

  return { articles, loading };
}

export function PersonalizedFeed() {
  const { slug, isLoaded, needsOnboarding } = useFavoriteTeam();
  const { articles, loading } = useTeamArticles(isLoaded ? slug : null);

  if (!isLoaded || needsOnboarding) return null;

  const title = slug
    ? `SENASTE OM ${slug.replace(/-/g, " ").toUpperCase()}`
    : "SENASTE NYTT";

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-3xl text-foreground text-balance">{title}</h2>
        {slug && (
          <Link
            href={`/lag/${slug}`}
            className="flex items-center gap-1 text-sm text-pitch-ink hover:underline"
          >
            Lagprofil <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : articles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {articles.map((a, i) => (
            <ArticleCard key={a.id} article={a} priority={i === 0} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm py-6 text-center">
          Inga nyheter hittade.{" "}
          <Link href="/nyheter" className="text-pitch-ink hover:underline">
            Bläddra alla nyheter →
          </Link>
        </p>
      )}

      {/* Utforska andra lag */}
      {slug && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Utforska:</span>
          <Link href="/nyheter" className="text-xs text-pitch-ink hover:underline">
            Alla lag →
          </Link>
          <Link href="/onboarding" className="text-xs text-muted-foreground hover:text-foreground">
            Byt lag
          </Link>
        </div>
      )}
    </section>
  );
}
