/**
 * Hemsport: vilken sport en användare "bor" i, delad över alla *.nanosport.se via cookien
 * `nano_sport`. nanosport.se använder den för att skicka inloggade till rätt sport (2026-10-01).
 */
export const HOME_SPORT_COOKIE = "nano_sport";
const SPORTS = ["fotboll", "hockey", "golf"] as const;
export type HomeSport = (typeof SPORTS)[number];

/** `hockey.nanosport.se` → "hockey". Allt annat (apex, admin, localhost) → null. */
export function sportOfHost(host: string): HomeSport | null {
  const m = /^(fotboll|hockey|golf)\.nanosport\.se$/.exec(host.toLowerCase());
  return m ? (m[1] as HomeSport) : null;
}

/** Vart en inloggad användare på nanosport.se ska. null = visa "Välj sport". */
export function apexDestination(cookie: string | undefined): string | null {
  return cookie && (SPORTS as readonly string[]).includes(cookie) ? `https://${cookie}.nanosport.se/mitt-lag` : null;
}
