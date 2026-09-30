import type { VerticalId } from "./vertical";

/**
 * Favoritlag och avklarad introduktion i Clerk `unsafeMetadata`, per sport.
 * Fotbollen läser och skriver exakt samma fält som tidigare (`favoriteTeam`,
 * `onboardingDone`); hockeyn har egna fält så att ett hockeyval aldrig skriver
 * över fotbollslaget. Samma princip som planen (`plan` / `plans.hockey`).
 */
type Meta = Record<string, unknown>;

export function favoriteFromMeta(meta: Meta | null | undefined, vertical: VerticalId): string | undefined {
  if (!meta) return undefined;
  if (vertical === "football") {
    return typeof meta.favoriteTeam === "string" ? meta.favoriteTeam : undefined;
  }
  const byVertical = meta.favoriteTeams;
  const value = byVertical && typeof byVertical === "object" ? (byVertical as Meta)[vertical] : undefined;
  return typeof value === "string" ? value : undefined;
}

export function onboardingDoneFromMeta(meta: Meta | null | undefined, vertical: VerticalId): boolean {
  if (!meta) return false;
  return vertical === "football" ? meta.onboardingDone === true : meta[`onboardingDone_${vertical}`] === true;
}

/** Ny metadata med favoriten satt (eller borttagen med null). Rör inga andra sporters fält. */
export function withFavorite(meta: Meta | null | undefined, vertical: VerticalId, slug: string | null): Meta {
  const next: Meta = { ...(meta ?? {}) };
  if (vertical === "football") {
    if (slug) {
      next.favoriteTeam = slug;
      next.onboardingDone = true;
    } else {
      delete next.favoriteTeam;
    }
    return next;
  }
  const teams = { ...((next.favoriteTeams as Meta | undefined) ?? {}) };
  if (slug) {
    teams[vertical] = slug;
    next[`onboardingDone_${vertical}`] = true;
  } else {
    delete teams[vertical];
  }
  next.favoriteTeams = teams;
  return next;
}

export function withOnboardingDone(meta: Meta | null | undefined, vertical: VerticalId): Meta {
  const next: Meta = { ...(meta ?? {}) };
  if (vertical === "football") next.onboardingDone = true;
  else next[`onboardingDone_${vertical}`] = true;
  return next;
}
