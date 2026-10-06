/** Ren modul — delas av servern (author-name.ts) och klienten (skrivrutan, onboardingen). */

export const FORUM_NAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
export const FORUM_NAME_HINT = "3–20 tecken: a–z, siffror och understreck.";

export function forumDisplayName(nickname: string | null | undefined, firstName: string | null | undefined): string {
  return nickname?.trim() || firstName?.trim() || "Supporter";
}
