/**
 * FixturesTicker — tunn horisontell matchremsa (The Athletic-mönstret).
 * Server Component. Visar senaste + kommande Allsvenskan-matcher som
 * scrollbara pills; live-matcher markeras. Varje pill → /match/[id].
 */

import Image from "next/image";
import Link from "next/link";
import { fetchAllsvenskanFixtures, parseFixtureScore } from "@/lib/db/fixtures";
import type { SMFixture } from "@/lib/db/fixtures";
import { cn } from "@/lib/utils";

const WINDOW_BACK_MS = 3 * 86_400_000;
const WINDOW_FWD_MS = 10 * 86_400_000;

function shortLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  if (sameDay) return time;
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Stockholm" });
}

/** "IFK Göteborg" → "IFK GÖT" är fel riktning — ta sista ordet om prefix är IFK/IF/BK/GAIS-stil. */
function abbr(name?: string): string {
  if (!name) return "?";
  const words = name.split(" ").filter(Boolean);
  const core = words.length > 1 && ["IFK", "IF", "BK", "FF"].includes(words[0]!.toUpperCase())
    ? words[1]!
    : words[0]!;
  return core.slice(0, 3).toUpperCase();
}

function TickerItem({ fixture }: { fixture: SMFixture }) {
  const { home, away, homeGoals, awayGoals, isLive } = parseFixtureScore(fixture);
  const played = homeGoals !== null && awayGoals !== null;

  return (
    <Link
      href={`/match/${fixture.id}`}
      className={cn(
        "flex min-h-11 items-center gap-2 shrink-0 rounded-full border border-border bg-card px-3",
        "text-xs transition-colors hover:border-pitch/40",
        isLive && "border-pitch/40 bg-pitch/5"
      )}
    >
      <span className="text-muted-foreground font-mono tabular-nums shrink-0">
        {isLive ? (
          <span className="flex items-center gap-1 text-success font-medium">
            <span className="live-dot" />
            LIVE
          </span>
        ) : (
          shortLabel(fixture.starting_at)
        )}
      </span>
      {home?.image_path && (
        <Image src={home.image_path} alt={home.name} width={16} height={16} className="object-contain" />
      )}
      <span className="font-medium">{abbr(home?.name)}</span>
      {played ? (
        <span className="font-heading font-mono tabular-nums">
          {homeGoals}–{awayGoals}
        </span>
      ) : (
        <span className="text-muted-foreground">–</span>
      )}
      <span className="font-medium">{abbr(away?.name)}</span>
      {away?.image_path && (
        <Image src={away.image_path} alt={away.name} width={16} height={16} className="object-contain" />
      )}
    </Link>
  );
}

export async function FixturesTicker() {
  const fixtures = await fetchAllsvenskanFixtures();
  // eslint-disable-next-line react-hooks/purity -- Server Component: körs en gång per request, hydreras aldrig.
  const now = Date.now();

  const window = fixtures
    .filter((f) => {
      const t = new Date(f.starting_at).getTime();
      return t > now - WINDOW_BACK_MS && t < now + WINDOW_FWD_MS;
    })
    .slice(0, 16);

  if (window.length === 0) return null;

  return (
    <nav
      aria-label="Matcher"
      className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-border/40 scrollbar-none [-webkit-overflow-scrolling:touch]"
    >
      {window.map((f) => (
        <TickerItem key={f.id} fixture={f} />
      ))}
    </nav>
  );
}
