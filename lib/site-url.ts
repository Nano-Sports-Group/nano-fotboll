/**
 * Canonical site URL — single source for metadata, JSON-LD, Stripe redirects, shares.
 * Prefer NEXT_PUBLIC_SITE_URL, then NEXT_PUBLIC_BASE_URL, then Vercel production host.
 * Never trust client-supplied hosts for redirects.
 */

const FALLBACK =
  process.env.NEXT_PUBLIC_VERTICAL === "hockey"
    ? "https://hockey.nanosport.se"
    : "https://fotboll.nanosport.se";

/** Publik kontaktadress. Mejlen tas emot i Workspace på nanosportsgroup.se (aliasdomän). */
export const CONTACT_EMAIL = "hello@nanosport.se";

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return FALLBACK;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Absolute origin without trailing slash. Safe for server + client (public env only). */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : "") ||
    "";
  return normalize(fromEnv || FALLBACK);
}

/** Host utan schema, t.ex. "fotboll.nanosport.se" — för text som visas för läsaren. */
export function getSiteHost(): string {
  return getSiteUrl().replace(/^https?:\/\//, "");
}

/** Join origin + path. Path may be empty, absolute path, or full URL (returned as-is). */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
