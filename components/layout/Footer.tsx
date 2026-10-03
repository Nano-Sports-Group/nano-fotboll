'use client'
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { leagueHref, vertical } from "@/lib/vertical";

export function Footer() {
  const pathname = usePathname();
  if (pathname === '/ai') return null;
  return (
    <footer className="hidden md:block border-t border-border/50 mt-24 py-12 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-10 text-sm">
        <div className="md:col-span-1">
          <div className="font-heading text-2xl text-gradient">{vertical.wordmark}</div>
          <p className="mt-2 text-muted-foreground">{vertical.tagline}</p>
          <div className="mt-4">
            <Badge variant="outline" className="bg-white/5 border-white/10 text-foreground/80">
              Byggd med AI
            </Badge>
          </div>
        </div>

        <div>
          <div className="font-medium text-foreground mb-3">Innehåll</div>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link href="/nyheter" className="hover:text-foreground transition-colors">
                Nyheter
              </Link>
            </li>
            {vertical.id !== "golf" && (
              <li>
                <Link href={leagueHref()} className="hover:text-foreground transition-colors">
                  {vertical.leagueName}
                </Link>
              </li>
            )}
            {!vertical.hiddenRoutes.includes("/podcast") && (
              <li>
                <Link href="/podcast" className="hover:text-foreground transition-colors">
                  Podcasts
                </Link>
              </li>
            )}
          </ul>
        </div>

        <div className={vertical.id === "golf" ? "hidden" : undefined}>
          <div className="font-medium text-foreground mb-3">Lag</div>
          <ul className="space-y-2 text-muted-foreground">
            {vertical.featuredTeams.map((team) => (
              <li key={team.href}>
                <Link href={team.href} className="hover:text-foreground transition-colors">
                  {team.label}
                </Link>
              </li>
            ))}
            {vertical.featuredTeams.length === 0 ? (
              <li>Lagen visas när intaget är på.</li>
            ) : null}
          </ul>
        </div>

        <div>
          <div className="font-medium text-foreground mb-3">Om</div>
          <ul className="space-y-2 text-muted-foreground">
            {!vertical.hiddenRoutes.includes("/prenumerera") && (
              <li>
                <Link href="/prenumerera" className="hover:text-foreground transition-colors">
                  Bli PRO
                </Link>
              </li>
            )}
            <li>
              <Link href="/integritetspolicy" className="hover:text-foreground transition-colors">
                Integritet
              </Link>
            </li>
            <li>
              <Link href="/anvandarvillkor" className="hover:text-foreground transition-colors">
                Användarvillkor
              </Link>
            </li>
            <li>
              <Link href="/ai-transparens" className="hover:text-foreground transition-colors">
                AI-transparens
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 text-xs text-muted-foreground">
        © {new Date().getFullYear()} {vertical.productName}.
      </div>
    </footer>
  );
}
