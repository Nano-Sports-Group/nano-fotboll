import { GOLF_PLAYERS, GOLF_TOURS } from "./catalog";

/**
 * Vad en golfanvändare följer: spelare och tourer, som slugar.
 * Sparas i Clerk `unsafeMetadata.golfFollows` (inloggad) eller i localStorage (gäst) — samma
 * mönster som favoritlaget i fotboll och hockey (lib/favorite-meta.ts). Ingen databas än:
 * `entities` har inga golfrader förrän intaget slås på. När de finns kopplas slugarna dit.
 */
export interface GolfFollows {
  players: string[];
  tours: string[];
}

export type FollowKind = keyof GolfFollows;

export const EMPTY_FOLLOWS: GolfFollows = { players: [], tours: [] };
export const GOLF_FOLLOWS_KEY = "golfFollows";

const KNOWN: Record<FollowKind, Set<string>> = {
  players: new Set(GOLF_PLAYERS.map((p) => p.slug)),
  tours: new Set(GOLF_TOURS.map((t) => t.slug)),
};

/** Läser ett sparat värde. Okända slugar (borttagna ur katalogen) och skräp faller bort. */
export function parseFollows(raw: unknown): GolfFollows {
  const pick = (kind: FollowKind): string[] => {
    const list = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[kind] : undefined;
    return Array.isArray(list) ? [...new Set(list.filter((s): s is string => typeof s === "string" && KNOWN[kind].has(s)))] : [];
  };
  return { players: pick("players"), tours: pick("tours") };
}

export function followsFromMeta(meta: Record<string, unknown> | null | undefined): GolfFollows {
  return parseFollows(meta?.[GOLF_FOLLOWS_KEY]);
}

export function isFollowing(follows: GolfFollows, kind: FollowKind, slug: string): boolean {
  return follows[kind].includes(slug);
}

/** Följ eller sluta följa. Okänd slug ändrar ingenting. */
export function toggleFollow(follows: GolfFollows, kind: FollowKind, slug: string): GolfFollows {
  if (!KNOWN[kind].has(slug)) return follows;
  const list = follows[kind];
  return { ...follows, [kind]: list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug] };
}

/** Ny metadata med följningarna satta. Rör inga andra fält (favoritlag i andra sporter, plan …). */
export function withFollows(meta: Record<string, unknown> | null | undefined, follows: GolfFollows): Record<string, unknown> {
  return { ...(meta ?? {}), [GOLF_FOLLOWS_KEY]: follows };
}

/** Gästens val förs över vid inloggning: unionen, utan dubbletter. */
export function mergeFollows(a: GolfFollows, b: GolfFollows): GolfFollows {
  return { players: [...new Set([...a.players, ...b.players])], tours: [...new Set([...a.tours, ...b.tours])] };
}

export const followCount = (follows: GolfFollows): number => follows.players.length + follows.tours.length;
