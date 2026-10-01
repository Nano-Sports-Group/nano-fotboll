/**
 * Landslaget — användarens intresse styr flödet (founder 2026-10-02, ADR-006).
 *
 *   none         "Inte intresserad": rena landslagsnyheter syns inte. Klubbvinkeln (artiklar som också
 *                är kopplade till en klubb, t.ex. "tre från Malmö i truppen") syns som vanligt.
 *   some         "Lagom" (standard): bara de viktigaste landslagsnyheterna (uttagning, resultat, stora
 *                besked — importance ≥ 0.7) plus klubbvinkeln.
 *   second_team  "Mitt andra lag": allt om landslaget, och landslaget räknas som ett följt lag.
 *
 * Landslagen är entiteter med metadata.league = 'Landslag' (slug sverige, sverige-dam).
 */
export const NATIONAL_INTEREST_LEVELS = ["none", "some", "second_team"] as const;
export type NationalInterest = (typeof NATIONAL_INTEREST_LEVELS)[number];

export const NATIONAL_INTEREST_LABELS: Record<NationalInterest, { label: string; hint: string }> = {
  none: { label: "Inte intresserad", hint: "Bara när dina spelare berörs" },
  some: { label: "Lagom", hint: "Det viktigaste: trupp, resultat, stora besked" },
  second_team: { label: "Mitt andra lag", hint: "Allt om landslaget, som ett lag du följer" },
};

/** Gräns för "Lagom": samma nivå som feedens "major". */
export const SOME_MIN_IMPORTANCE = 0.7;

export function parseNationalInterest(value: unknown): NationalInterest {
  return (NATIONAL_INTEREST_LEVELS as readonly unknown[]).includes(value) ? (value as NationalInterest) : "some";
}

type Row = { entity_ids?: string[] | null; importance_score?: number | null };

/** Ska raden visas för den här användaren? Rader utan landslagskoppling påverkas aldrig. */
export function keepForNationalInterest(row: Row, interest: NationalInterest, national: Set<string>): boolean {
  const ids = row.entity_ids ?? [];
  const touchesNational = ids.some((id) => national.has(id));
  if (!touchesNational) return true;
  const nationalOnly = ids.every((id) => national.has(id));
  if (!nationalOnly) return true; // klubbvinkeln
  if (interest === "second_team") return true;
  if (interest === "none") return false;
  return (row.importance_score ?? 0) >= SOME_MIN_IMPORTANCE;
}
