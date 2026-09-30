import Link from "next/link";
import { vertical } from "@/lib/vertical";

/**
 * Växlar mellan vertikalens ligor på tabell/spelschema/resultat (hockey: SHL | HockeyAllsvenskan).
 * Server-renderade länkar med ?liga= — ingen klientstate. Renderas inte när vertikalen har en liga.
 */
export function LeagueSwitcher({ basePath, active }: { basePath: string; active?: string }) {
  if (vertical.leagues.length < 2) return null;
  const current = active ?? vertical.leagues[0].name;
  return (
    <nav aria-label="Välj liga" className="mb-6 inline-flex rounded-full border border-border bg-card p-1">
      {vertical.leagues.map((l) => {
        const selected = l.name === current;
        return (
          <Link
            key={l.name}
            href={l.param ? `${basePath}?liga=${l.param}` : basePath}
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
