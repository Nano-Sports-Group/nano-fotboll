import { SPORT, VERTICAL, leagueHref } from "@/lib/vertical";
import { GOLF_PLAYERS, GOLF_TOURS } from "@/lib/golf/catalog";
import type { MetadataRoute } from "next";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = 'force-dynamic';

const BASE = getSiteUrl();

/** Golf har inga lag-, match- eller ligasidor: hem, flöde, spelare, tourer och egna texter. */
async function golfSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: `${BASE}/golf`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/nyheter`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/golf/spelare`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/golf/tourer`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...GOLF_PLAYERS.map((p) => ({ url: `${BASE}/golf/spelare/${p.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...GOLF_TOURS.map((t) => ({ url: `${BASE}/golf/tourer/${t.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
  if (!isSupabaseConfigured()) return routes;
  try {
    const { data } = await createServerClient()
      .from("articles")
      .select("slug, published_at, rights_status, is_athopia_generated")
      .eq("status", "published")
      .eq("sport", SPORT)
      .order("published_at", { ascending: false })
      .limit(1000);
    for (const a of data ?? []) {
      const rights = a.rights_status ?? (a.is_athopia_generated ? "owned" : "link_only");
      if (a.slug && (rights === "owned" || rights === "licensed")) {
        routes.push({ url: `${BASE}/artikel/${a.slug}`, lastModified: new Date(a.published_at), changeFrequency: "weekly", priority: 0.7 });
      }
    }
  } catch {
    // Utan databas: de statiska sidorna räcker.
  }
  return routes;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (VERTICAL === "golf") return golfSitemap();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/nyheter`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}${leagueHref()}`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.85 },
    { url: `${BASE}${leagueHref("/tabell")}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE}${leagueHref("/skytteliga")}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}${leagueHref("/xp-tabell")}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE}${leagueHref("/talanger")}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}${leagueHref("/spelschema")}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.75 },
    { url: `${BASE}${leagueHref("/resultat")}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/match`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.85 },
    { url: `${BASE}/statistik`, lastModified: new Date(), changeFrequency: "daily", priority: 0.75 },
    { url: `${BASE}/forum`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/podcast`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/daily`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
    { url: `${BASE}/prenumerera`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    // Omgångssidor (programmatisk SEO)
    ...Array.from({ length: 30 }, (_, i) => ({
      url: `${BASE}${leagueHref(`/omgang/${i + 1}`)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.65,
    })),
  ];

  if (!isSupabaseConfigured()) return staticRoutes;

  let articleRoutes: MetadataRoute.Sitemap = [];
  let teamRoutes: MetadataRoute.Sitemap = [];
  let playerRoutes: MetadataRoute.Sitemap = [];
  let podcastRoutes: MetadataRoute.Sitemap = [];
  let matchRoutes: MetadataRoute.Sitemap = [];
  let forumRoutes: MetadataRoute.Sitemap = [];
  const h2hRoutes: MetadataRoute.Sitemap = [];

  try {
    const supabase = createServerClient();

    const { data: articles } = await supabase
      .from("articles")
      .select("slug, published_at, rights_status, is_athopia_generated")
      .eq("status", "published")
      .eq("sport", SPORT)
      .order("published_at", { ascending: false })
      .limit(1000);
    // Sitemap only indexes owned/licensed Nano Fotboll pages — link_only is noindex /nyhet.
    articleRoutes = (articles ?? [])
      .filter((a) => {
        const rights = a.rights_status ?? (a.is_athopia_generated ? "owned" : "link_only");
        return rights === "owned" || rights === "licensed";
      })
      .filter((a) => a.slug)
      .map((a) => ({
        url: `${BASE}/artikel/${a.slug}`,
        lastModified: new Date(a.published_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    // OBS: teams-tabellen saknar slug-kolumn — laglugs lever i entities (type='team')
    const { data: teams } = await supabase
      .from("entities")
      .select("slug, updated_at")
      .eq("type", "team")
      .eq("sport", SPORT)
      .not("sportmonks_id", "is", null)
      .not("slug", "is", null);
    teamRoutes = (teams ?? []).map((t) => ({
      url: `${BASE}/lag/${t.slug}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

    const { data: players } = await supabase.from("players").select("slug, updated_at").eq("sport", SPORT);
    playerRoutes = (players ?? []).map((p) => ({
      url: `${BASE}/spelare/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.55,
    }));

    // Matchsidor: färdigspelade (matchrapporter, permanent SEO-värde) + kommande
    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("sportmonks_id, kickoff_at, status, updated_at")
      .eq("sport", SPORT)
      .in("status", ["FT", "NS", "LIVE"])
      .order("kickoff_at", { ascending: false })
      .limit(500);
    matchRoutes = (fixtures ?? []).map((f) => ({
      url: `${BASE}/match/${f.sportmonks_id}`,
      lastModified: f.updated_at ? new Date(f.updated_at) : new Date(),
      changeFrequency: (f.status === "FT" ? "monthly" : "hourly") as "monthly" | "hourly",
      priority: f.status === "FT" ? 0.6 : 0.75,
    }));

    // H2H-möten (kanonisk ordning = svensk alfabetisk på slug)
    const teamSlugs = (teams ?? []).map((t) => String(t.slug)).filter(Boolean).sort((a, b) => a.localeCompare(b, "sv"));
    for (let i = 0; i < teamSlugs.length; i++) {
      for (let j = i + 1; j < teamSlugs.length; j++) {
        h2hRoutes.push({
          url: `${BASE}/allsvenskan/moten/${teamSlugs[i]}-vs-${teamSlugs[j]}`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        });
      }
    }

    // Klubbforum
    forumRoutes = (teams ?? []).map((t) => ({
      url: `${BASE}/forum/${t.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.55,
    }));

    const { data: podcasts } = await supabase
      .from("podcasts")
      .select("id, published_at, rss_sources!inner(sport)")
      .eq("rss_sources.sport", SPORT)
      .order("published_at", { ascending: false })
      .limit(2000);
    podcastRoutes = (podcasts ?? []).map((p) => ({
      url: `${BASE}/podcast/${p.id}`,
      lastModified: new Date(p.published_at),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  } catch {
    // DB nere — returnera statiska routes
  }

  return [...staticRoutes, ...articleRoutes, ...teamRoutes, ...matchRoutes, ...h2hRoutes, ...forumRoutes, ...playerRoutes, ...podcastRoutes];
}
