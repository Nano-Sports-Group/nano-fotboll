import { vertical } from "@/lib/vertical";
/**
 * Website-inställningar — hur Nano Fotboll ser ut när någon delar eller googlar.
 *
 * Kanonisk källa: `system_config.key = 'website'` (JSON). Admin skriver,
 * den här modulen läser. Resolver-logiken speglar athopia-admin/lib/website-settings.ts
 * — ändra båda, eller unfurls och admin-preview driver isär.
 *
 * Doktrin: athopia-admin/docs/website.md
 */

import type { Metadata } from "next";
import { CONTACT_EMAIL, getSiteUrl } from "@/lib/site-url";

export const WEBSITE_CONFIG_KEY = "website";

export const CHAR_BUDGET = {
  seoTitle: 60,
  seoDescription: 160,
  ogTitle: 70,
  ogDescription: 200,
} as const;

export type TwitterCard = "summary_large_image" | "summary";

export type WebsiteSettings = {
  version: 1;
  identity: {
    siteName: string;
    tagline: string;
    titleTemplate: string;
    twitterHandle: string;
    locale: string;
    contactEmail: string;
  };
  seo: {
    defaultTitle: string;
    defaultDescription: string;
    homeTitle: string;
    homeDescription: string;
  };
  sharing: {
    homeOgTitle: string;
    homeOgDescription: string;
    ogImageUrl: string;
    twitterCard: TwitterCard;
    includeBrandInOgTitle: boolean;
    articleDescriptionFallback: "tagline" | "defaultDescription";
    nyhetDescriptionTemplate: string;
    teamTitleTemplate: string;
    teamDescriptionTemplate: string;
    matchUpcomingTitleTemplate: string;
    matchResultTitleTemplate: string;
    matchDescriptionTemplate: string;
  };
};

export const SUGGESTED_HOME_SHARE = {
  ogTitle: "Nano Fotboll — Allsvenskan, varje dag",
  ogDescription:
    "Nyheter, matcher och statistik för ditt lag. Varje dag, inte bara på matchdag.",
} as const;

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  version: 1,
  identity: {
    siteName: "Nano Fotboll",
    tagline: "Allsvenskan, varje dag.",
    titleTemplate: "%s | Nano Fotboll",
    twitterHandle: "@athopia_se",
    locale: "sv_SE",
    contactEmail: CONTACT_EMAIL,
  },
  seo: {
    defaultTitle: "Nano Fotboll — Allsvenskan 2026: tabell, resultat & statistik",
    defaultDescription:
      "Allt om Allsvenskan 2026 — live-tabell, resultat, spelschema, skytteliga och djupstatistik för alla 16 lag. Matchanalyser, nyhetsflöde och forum för ditt lag, samlat på ett ställe.",
    homeTitle: "Allsvenskan 2026 – Tabell, Resultat, Matcher & Statistik | Nano Fotboll",
    homeDescription:
      "Allt om Allsvenskan 2026: live-tabell, resultat, spelschema, skytteliga och djupstatistik för alla 16 lag. Matchanalyser, nyhetsflöde och forum för ditt lag — samlat på ett ställe.",
  },
  sharing: {
    homeOgTitle: "Allsvenskan 2026 – Tabell, Resultat, Matcher & Statistik | Nano Fotboll",
    homeOgDescription:
      "Live-tabell, resultat, spelschema, skytteliga och djupstatistik för hela Allsvenskan 2026. Matchanalyser och forum för ditt lag.",
    ogImageUrl: "/og-default.png",
    twitterCard: "summary_large_image",
    includeBrandInOgTitle: false,
    articleDescriptionFallback: "defaultDescription",
    nyhetDescriptionTemplate: "Nano Fotboll följer händelsen. Originalet hos {source}.",
    teamTitleTemplate: "{team} – {league} 2026: Nyheter, Statistik & Matcher",
    teamDescriptionTemplate:
      "Allt om {team} i {league} — senaste nyheter, matchresultat, spelartrupp, statistik och lagforum.",
    matchUpcomingTitleTemplate: "{home} – {away}",
    matchResultTitleTemplate: "{home} {homeScore}–{awayScore} {away}",
    matchDescriptionTemplate: "Matchen mellan {home} och {away} i Allsvenskan.",
  },
};

export const HOCKEY_DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  ...DEFAULT_WEBSITE_SETTINGS,
  identity: {
    ...DEFAULT_WEBSITE_SETTINGS.identity,
    siteName: "Nano Hockey",
    tagline: "SHL, varje dag.",
    titleTemplate: "%s | Nano Hockey",
    contactEmail: CONTACT_EMAIL,
  },
  seo: {
    defaultTitle: "Nano Hockey — SHL och HockeyAllsvenskan 2026/27: tabell, resultat och statistik",
    defaultDescription:
      "SHL och HockeyAllsvenskan 2026/27 — tabell, resultat, spelschema och nyheter för alla 28 lag. Följ ditt lag varje dag, inte bara på matchdag.",
    homeTitle: "SHL och HockeyAllsvenskan 2026/27 – Tabell, Resultat och Matcher | Nano Hockey",
    homeDescription:
      "SHL och HockeyAllsvenskan 2026/27: tabell, resultat, spelschema och nyhetsflöde för alla 28 lag.",
  },
  sharing: {
    ...DEFAULT_WEBSITE_SETTINGS.sharing,
    homeOgTitle: "SHL och HockeyAllsvenskan 2026/27 – Tabell, Resultat och Matcher | Nano Hockey",
    homeOgDescription:
      "Tabell, resultat, spelschema och nyheter för SHL och HockeyAllsvenskan. Matchsidor och forum för ditt lag.",
    nyhetDescriptionTemplate: "Nano Hockey följer händelsen. Originalet hos {source}.",
    teamTitleTemplate: "{team} 2026/27: Nyheter, Tabell och Matcher",
    teamDescriptionTemplate:
      "Allt om {team} — senaste nyheter, matchresultat, tabelläge och lagforum.",
    matchDescriptionTemplate: "Matchen mellan {home} och {away}.",
  },
};

export const GOLF_DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  ...DEFAULT_WEBSITE_SETTINGS,
  identity: {
    ...DEFAULT_WEBSITE_SETTINGS.identity,
    siteName: "Nano Golf",
    tagline: "Svensk golf, varje dag.",
    titleTemplate: "%s | Nano Golf",
    contactEmail: CONTACT_EMAIL,
  },
  seo: {
    defaultTitle: "Nano Golf — svenska spelare, tourerna och majors",
    defaultDescription:
      "Golf ur svenskt perspektiv: svenska spelare på PGA Tour, DP World Tour, LPGA och LET, och majors. Följ golfen varje dag, inte bara på söndagen.",
    homeTitle: "Nano Golf – svenska spelare, tourerna och majors",
    homeDescription:
      "Golf ur svenskt perspektiv: svenska spelare på de stora tourerna och majors, samlat på ett ställe.",
  },
  sharing: {
    ...DEFAULT_WEBSITE_SETTINGS.sharing,
    homeOgTitle: "Nano Golf – svenska spelare, tourerna och majors",
    homeOgDescription: "Golf ur svenskt perspektiv: svenska spelare, tourerna och majors.",
    nyhetDescriptionTemplate: "Nano Golf följer händelsen. Originalet hos {source}.",
  },
};

export type ShareContext =
  | { kind: "home" }
  | { kind: "default" }
  | { kind: "article"; title: string; summary: string | null; path: string }
  | { kind: "nyhet"; title: string; sourceName: string | null; path: string }
  | { kind: "team"; team: string; path: string; /** Lagets egen liga (Superettan, Landslag …). */ league?: string }
  | {
      kind: "match";
      home: string;
      away: string;
      homeScore: number | null;
      awayScore: number | null;
      when: string | null;
      path: string;
    };

export type ResolvedShare = {
  title: string;
  titleAbsolute: boolean;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogType: "website" | "article";
  ogImageUrl: string;
  twitterCard: TwitterCard;
  robots: { index: boolean; follow: boolean };
  canonicalPath: string;
};

const TITLE_MAX = 120;
const DESC_MAX = 320;
const TEMPLATE_MAX = 240;
const URL_MAX = 500;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, max);
}

function twitterHandle(value: unknown, fallback: string): string {
  const raw = str(value, fallback, 32);
  const withAt = raw.startsWith("@") ? raw : `@${raw}`;
  return /^@[A-Za-z0-9_]{1,15}$/.test(withAt) ? withAt : fallback;
}

function twitterCard(value: unknown, fallback: TwitterCard): TwitterCard {
  return value === "summary" || value === "summary_large_image" ? value : fallback;
}

function ogImageUrl(value: unknown, fallback: string): string {
  const raw = str(value, fallback, URL_MAX);
  if (raw.startsWith("/")) return raw;
  if (/^https:\/\//i.test(raw)) return raw;
  return fallback;
}

export function parseWebsiteSettings(
  raw: unknown,
  defaults: WebsiteSettings = DEFAULT_WEBSITE_SETTINGS,
): WebsiteSettings {
  const d = defaults;
  const root = asRecord(raw);
  const identity = asRecord(root.identity);
  const seo = asRecord(root.seo);
  const sharing = asRecord(root.sharing);

  const titleTemplate = str(identity.titleTemplate, d.identity.titleTemplate, 80);
  const includeBrand =
    typeof sharing.includeBrandInOgTitle === "boolean"
      ? sharing.includeBrandInOgTitle
      : d.sharing.includeBrandInOgTitle;

  return {
    version: 1,
    identity: {
      siteName: str(identity.siteName, d.identity.siteName, 40),
      tagline: str(identity.tagline, d.identity.tagline, 80),
      titleTemplate: titleTemplate.includes("%s") ? titleTemplate : d.identity.titleTemplate,
      twitterHandle: twitterHandle(identity.twitterHandle, d.identity.twitterHandle),
      locale: str(identity.locale, d.identity.locale, 12),
      contactEmail: str(identity.contactEmail, d.identity.contactEmail, 80),
    },
    seo: {
      defaultTitle: str(seo.defaultTitle, d.seo.defaultTitle, TITLE_MAX),
      defaultDescription: str(seo.defaultDescription, d.seo.defaultDescription, DESC_MAX),
      homeTitle: str(seo.homeTitle, d.seo.homeTitle, TITLE_MAX),
      homeDescription: str(seo.homeDescription, d.seo.homeDescription, DESC_MAX),
    },
    sharing: {
      homeOgTitle: str(sharing.homeOgTitle, d.sharing.homeOgTitle, TITLE_MAX),
      homeOgDescription: str(sharing.homeOgDescription, d.sharing.homeOgDescription, DESC_MAX),
      ogImageUrl: ogImageUrl(sharing.ogImageUrl, d.sharing.ogImageUrl),
      twitterCard: twitterCard(sharing.twitterCard, d.sharing.twitterCard),
      includeBrandInOgTitle: includeBrand,
      articleDescriptionFallback:
        sharing.articleDescriptionFallback === "tagline" ? "tagline" : "defaultDescription",
      nyhetDescriptionTemplate: str(
        sharing.nyhetDescriptionTemplate,
        d.sharing.nyhetDescriptionTemplate,
        TEMPLATE_MAX,
      ),
      teamTitleTemplate: str(sharing.teamTitleTemplate, d.sharing.teamTitleTemplate, TEMPLATE_MAX),
      teamDescriptionTemplate: str(
        sharing.teamDescriptionTemplate,
        d.sharing.teamDescriptionTemplate,
        TEMPLATE_MAX,
      ),
      matchUpcomingTitleTemplate: str(
        sharing.matchUpcomingTitleTemplate,
        d.sharing.matchUpcomingTitleTemplate,
        TEMPLATE_MAX,
      ),
      matchResultTitleTemplate: str(
        sharing.matchResultTitleTemplate,
        d.sharing.matchResultTitleTemplate,
        TEMPLATE_MAX,
      ),
      matchDescriptionTemplate: str(
        sharing.matchDescriptionTemplate,
        d.sharing.matchDescriptionTemplate,
        TEMPLATE_MAX,
      ),
    },
  };
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (full, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full;
  });
}

function withBrand(title: string, settings: WebsiteSettings, forOg: boolean): string {
  if (!forOg) return title;
  if (!settings.sharing.includeBrandInOgTitle) return title;
  const name = settings.identity.siteName;
  if (title.includes(name)) return title;
  return `${title} | ${name}`;
}

function articleFallback(settings: WebsiteSettings): string {
  return settings.sharing.articleDescriptionFallback === "tagline"
    ? settings.identity.tagline
    : settings.seo.defaultDescription;
}

function hasResult(homeScore: number | null, awayScore: number | null): boolean {
  return typeof homeScore === "number" && typeof awayScore === "number";
}

export function resolveShareMetadata(
  settings: WebsiteSettings,
  ctx: ShareContext,
): ResolvedShare {
  const image = settings.sharing.ogImageUrl;
  const card = settings.sharing.twitterCard;

  if (ctx.kind === "home") {
    return {
      title: settings.seo.homeTitle,
      titleAbsolute: true,
      description: settings.seo.homeDescription,
      ogTitle: settings.sharing.homeOgTitle,
      ogDescription: settings.sharing.homeOgDescription,
      ogType: "website",
      ogImageUrl: image,
      twitterCard: card,
      robots: { index: true, follow: true },
      canonicalPath: "/",
    };
  }

  if (ctx.kind === "default") {
    return {
      title: settings.seo.defaultTitle,
      titleAbsolute: true,
      description: settings.seo.defaultDescription,
      ogTitle: settings.sharing.homeOgTitle,
      ogDescription: settings.sharing.homeOgDescription,
      ogType: "website",
      ogImageUrl: image,
      twitterCard: card,
      robots: { index: true, follow: true },
      canonicalPath: "/",
    };
  }

  if (ctx.kind === "article") {
    const summary = ctx.summary?.trim() || articleFallback(settings);
    return {
      title: ctx.title,
      titleAbsolute: false,
      description: summary,
      ogTitle: withBrand(ctx.title, settings, true),
      ogDescription: summary,
      ogType: "article",
      ogImageUrl: image,
      twitterCard: card,
      robots: { index: true, follow: true },
      canonicalPath: ctx.path,
    };
  }

  if (ctx.kind === "nyhet") {
    const source = ctx.sourceName?.trim() || "källan";
    const description = interpolate(settings.sharing.nyhetDescriptionTemplate, { source });
    return {
      title: ctx.title,
      titleAbsolute: false,
      description,
      ogTitle: withBrand(ctx.title, settings, true),
      ogDescription: description,
      ogType: "article",
      ogImageUrl: image,
      twitterCard: card,
      robots: { index: false, follow: true },
      canonicalPath: ctx.path,
    };
  }

  if (ctx.kind === "team") {
    // Lag i en annan liga än huvudligan (Superettan, landslaget) får sin egen liga i titeln — även när
    // en admin-sparad mall har huvudligans namn utskrivet i stället för {league}.
    const league = ctx.league && ctx.league !== "Landslag" ? ctx.league : ctx.league === "Landslag" ? "landslaget" : vertical.leagueName;
    const vars = { team: ctx.team, league };
    const swap = (t: string) => (league !== vertical.leagueName ? t.split(vertical.leagueName).join(league) : t);
    const title = swap(interpolate(settings.sharing.teamTitleTemplate, vars));
    const description = swap(interpolate(settings.sharing.teamDescriptionTemplate, vars));
    return {
      title,
      titleAbsolute: false,
      description,
      ogTitle: withBrand(title, settings, true),
      ogDescription: description,
      ogType: "website",
      ogImageUrl: image,
      twitterCard: card,
      robots: { index: true, follow: true },
      canonicalPath: ctx.path,
    };
  }

  const vars: Record<string, string> = {
    home: ctx.home,
    away: ctx.away,
    when: ctx.when?.trim() || "",
    homeScore: hasResult(ctx.homeScore, ctx.awayScore) ? String(ctx.homeScore) : "",
    awayScore: hasResult(ctx.homeScore, ctx.awayScore) ? String(ctx.awayScore) : "",
  };
  const title = hasResult(ctx.homeScore, ctx.awayScore)
    ? interpolate(settings.sharing.matchResultTitleTemplate, vars)
    : interpolate(settings.sharing.matchUpcomingTitleTemplate, vars).replace(/\s+·\s+$/, "").trim();
  const description = interpolate(settings.sharing.matchDescriptionTemplate, vars);
  return {
    title,
    titleAbsolute: false,
    description,
    ogTitle: withBrand(title, settings, true),
    ogDescription: description,
    ogType: "article",
    ogImageUrl: image,
    twitterCard: card,
    robots: { index: true, follow: true },
    canonicalPath: ctx.path,
  };
}

export function budgetTone(length: number, budget: number): "ok" | "warn" | "over" {
  if (length > budget) return "over";
  if (length > budget - 8) return "warn";
  return "ok";
}

export function previewHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, "");
  } catch {
    return "fotboll.nanosport.se";
  }
}

export function absoluteOgImage(url: string, siteUrl: string): string {
  if (/^https:\/\//i.test(url)) return url;
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export function toNextMetadata(
  settings: WebsiteSettings,
  resolved: ResolvedShare,
  siteUrl: string = getSiteUrl(),
): Metadata {
  const origin = siteUrl.replace(/\/$/, "");
  const canonical =
    resolved.canonicalPath === "/" ? origin : `${origin}${resolved.canonicalPath}`;
  const image = absoluteOgImage(resolved.ogImageUrl, origin);

  return {
    title: resolved.titleAbsolute ? { absolute: resolved.title } : resolved.title,
    description: resolved.description,
    alternates: { canonical },
    robots: resolved.robots,
    openGraph: {
      type: resolved.ogType,
      locale: settings.identity.locale,
      siteName: settings.identity.siteName,
      title: resolved.ogTitle,
      description: resolved.ogDescription,
      url: canonical,
      images: [{ url: image }],
    },
    twitter: {
      card: resolved.twitterCard,
      site: settings.identity.twitterHandle,
      title: resolved.ogTitle,
      description: resolved.ogDescription,
      images: [image],
    },
  };
}

export function rootMetadataFromSettings(settings: WebsiteSettings, siteUrl: string): Metadata {
  const resolved = resolveShareMetadata(settings, { kind: "default" });
  const origin = siteUrl.replace(/\/$/, "");
  const image = absoluteOgImage(resolved.ogImageUrl, origin);
  return {
    metadataBase: new URL(origin),
    manifest: "/manifest.json",
    title: {
      default: settings.seo.defaultTitle,
      template: settings.identity.titleTemplate,
    },
    description: settings.seo.defaultDescription,
    openGraph: {
      type: "website",
      locale: settings.identity.locale,
      url: origin,
      siteName: settings.identity.siteName,
      images: [{ url: image }],
    },
    twitter: {
      card: settings.sharing.twitterCard,
      site: settings.identity.twitterHandle,
    },
    robots: { index: true, follow: true },
  };
}
