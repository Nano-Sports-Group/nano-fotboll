/** Ren hjälpare (egen fil: hockey-squad.ts är server-only och går inte att testa i node). */

/** Ålder i hela år på dagens datum i svensk tid. */
export function ageOn(birthdate: string | null, today: string): number | null {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}/.test(birthdate)) return null;
  // Sportradar skriver 1 januari när bara årtalet är känt (och ibland fel årtal: en 15-årig målvakt på 96 kg).
  // Hellre ingen ålder än en påhittad.
  if (birthdate.slice(5, 10) === "01-01") return null;
  const [by, bm, bd] = birthdate.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty! - by! - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
  return age >= 16 && age <= 60 ? age : null;
}
