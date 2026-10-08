import Link from "next/link";
import { MAIN_LEAGUE_PARAM, vertical } from "@/lib/vertical";

/**
 * Växlar mellan vertikalens ligor på tabell/spelschema/resultat (hockey: SHL | HockeyAllsvenskan).
 * Server-renderade länkar med ?liga= — ingen klientstate. Renderas inte när vertikalen har en liga.
 * Alla vertikalens ligor visas, även de som väntar på data (founderbeslut 2026-10-08): sidan
 * under visar då sitt tomma läge. En ny liga är en rad i `lib/vertical.ts`.
 */
export function LeagueSwitcher({
  basePath,
  active,
  /** Tittarens hemliga är inte huvudligan: utan param hamnar hen i hemligan, så huvudlänken måste säga sitt. */
  explicitMain = false,
}: {
  basePath: string;
  active?: string;
  explicitMain?: boolean;
}) {
  const leagues = vertical.leagues;
  if (leagues.length < 2) return null;
  const current = active ?? leagues[0].name;
  return (
    <nav aria-label="Välj liga" className="mb-6 inline-flex rounded-full border border-border bg-card p-1">
      {leagues.map((l) => {
        const selected = l.name === current;
        return (
          <Link
            key={l.name}
            href={l.param ? `${basePath}?liga=${l.param}` : explicitMain ? `${basePath}?liga=${MAIN_LEAGUE_PARAM}` : basePath}
            aria-current={selected ? "page" : undefined}
            className={`min-h-11 inline-flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
              selected ? "pitch-gradient text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.name}
          </Link>
        );
      })}
    </nav>
  );
}
