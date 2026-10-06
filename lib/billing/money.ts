/**
 * Pengar i minsta enhet. Antalet decimaler kommer ur ICU:s valutadata (SEK 2, JPY 0, BHD 3),
 * så ingen valutalista behöver underhållas här.
 */

export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Apple anger pris i tusendelar av valutaenheten (milliunits): 89000 = 89,00 kr. */
export function milliunitsToMinor(milliunits: number, currency: string): number {
  return Math.round((milliunits * 10 ** currencyDecimals(currency)) / 1000);
}

/** Googles `Money`: heltalsdel + nano (miljarddelar). */
export interface GoogleMoney {
  currencyCode?: string;
  units?: string | number;
  nanos?: number;
}

export function googleMoneyToMinor(money: GoogleMoney | null | undefined): { amount: number; currency: string } | null {
  if (!money?.currencyCode) return null;
  const units = Number(money.units ?? 0);
  if (!Number.isFinite(units)) return null;
  const decimals = currencyDecimals(money.currencyCode);
  const amount = Math.round((units + (money.nanos ?? 0) / 1e9) * 10 ** decimals);
  return { amount, currency: money.currencyCode.toUpperCase() };
}
