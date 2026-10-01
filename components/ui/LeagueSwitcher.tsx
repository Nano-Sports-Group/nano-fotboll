import Link from "next/link";
import { vertical } from "@/lib/vertical";
import { fetchLeaguesWithData } from "@/lib/db/fixtures";

/**
 * Växlar mellan vertikalens ligor på tabell/spelschema/resultat (hockey: SHL | HockeyAllsvenskan).
 * Server-renderade länkar med ?liga= — ingen klientstate. Renderas inte när vertikalen har en liga.
 * Bara ligor med data visas: huvudligan alltid, övriga när en säsong finns i DB (Superettan).
 */
export async function LeagueSwitcher({ basePath, active }: { basePath: string; active?: string }) {
  const withData = new Set(await fetchLeaguesWithData());
  const leagues = vertical.leagues.filter((l, i) => i === 0 || withData.has(l.name));
  if (leagues.length < 2) return null;
  const current = active ?? leagues[0].name;
  return (
    <nav aria-label="Välj liga" className="mb-6 inline-flex rounded-full border border-border bg-card p-1">
      {leagues.map((l) => {
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
