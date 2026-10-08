/**
 * Notistyperna — en lista för alla sporter. Användaren slår av och på dem per sport i Profil;
 * valen ligger i `profiles.notification_prefs`. Apparna ritar sina reglage ur
 * GET /api/push/preferences och hårdkodar ingenting.
 *
 * `label` är också rubriken på själva notisen ("Djurgården · Rykte"). Vilka händelser som hör
 * till vilken typ avgörs i nano-os (`packages/notifications/src/notification-types.ts`) — samma
 * id:n och förval där. Ändra båda.
 *
 * Bara typer som har ett utskick står här. Forumsvar och mål i realtid läggs till när de finns.
 */
export const NOTIFICATION_TYPES = [
  { id: "news", label: "Nyhet", title: "Stora nyheter", description: "Tränarbyten, klara värvningar och skador på nyckelspelare.", defaultOn: true },
  { id: "rumours", label: "Rykte", title: "Rykten", description: "Obekräftade uppgifter om värvningar och försäljningar.", defaultOn: false },
  { id: "daily", label: "Daily", title: "Daily", description: "Dagens sammanfattning om ditt lag.", defaultOn: true },
  { id: "match_start", label: "Matchstart", title: "Matchstart", description: "När matchen börjar.", defaultOn: true },
  { id: "match_result", label: "Match", title: "Resultat och matchrapport", description: "Slutresultat, betyg och analys efter matchen.", defaultOn: true },
] as const;

export type NotificationTypeId = (typeof NOTIFICATION_TYPES)[number]["id"];

export function isNotificationTypeId(value: unknown): value is NotificationTypeId {
  return NOTIFICATION_TYPES.some((t) => t.id === value);
}

/** Användarens val för en sport, med förvalen ifyllda. Okända nycklar i lagrat värde ignoreras. */
export function resolveNotificationPrefs(stored: unknown, sport: string): Array<{ id: NotificationTypeId; enabled: boolean }> {
  const bySport = stored && typeof stored === "object" ? (stored as Record<string, unknown>)[sport] : null;
  const chosen = bySport && typeof bySport === "object" ? (bySport as Record<string, unknown>) : {};
  return NOTIFICATION_TYPES.map((t) => ({
    id: t.id,
    enabled: typeof chosen[t.id] === "boolean" ? (chosen[t.id] as boolean) : t.defaultOn,
  }));
}
