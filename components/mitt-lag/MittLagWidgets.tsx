import { fixtureHref } from "@/lib/match/slug";
import Link from "next/link";
import { MessageSquare, Newspaper } from "lucide-react";
import type { TeamHubPayload } from "@/lib/team-hub/queries";
import { articlePublicPath } from "@/lib/provenance";

function formatKickoff(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tät widgetstack: nästa match, form, nyheter, trådar (LAUNCH-05). */
export function MittLagWidgets({
  hub,
  guest = false,
}: {
  hub: TeamHubPayload;
  guest?: boolean;
}) {
  const next = hub.upcoming[0] ?? null;
  const news = hub.news.slice(0, 5);
  const threads = hub.threads.slice(0, 4);

  return (
    <div className="space-y-5">
      {next ? (
        <section className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nästa match
          </p>
          <Link
            href={fixtureHref(next)}
            className="mt-2 block hover:opacity-90 transition-opacity"
          >
            <p className="text-lg font-semibold text-foreground">
              {next.home_team_name} – {next.away_team_name}
            </p>
            <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">
              {formatKickoff(next.kickoff_at)}
            </p>
          </Link>
        </section>
      ) : null}

      {/* Formprickarna låg både här och i tabellplaceringskortet ovanför —
          samma fem prickar två gånger på samma skärm. Placeringskortet parar
          ihop position och form, vilket är den kombination som betyder något. */}

      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <Newspaper className="h-3.5 w-3.5" aria-hidden />
            Nyheter
          </p>
          <Link
            href={`/nyheter?lag=${encodeURIComponent(hub.team.name)}`}
            className="text-xs text-pitch-ink hover:underline"
          >
            Alla
          </Link>
        </div>
        {news.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga nyheter just nu.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {news.map((n) => (
              <li key={n.id}>
                <Link
                  href={articlePublicPath({
                    slug: n.slug,
                    rights_status: n.rights_status,
                  })}
                  className="block py-2.5 text-sm font-medium text-foreground hover:text-pitch-ink transition-colors line-clamp-2"
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Trådar
          </p>
          <Link href={`/forum/${hub.team.slug}`} className="text-xs text-pitch-ink hover:underline">
            Forum
          </Link>
        </div>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga trådar ännu — starta en.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/forum/${hub.team.slug}/${t.id}`}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <span className="text-sm font-medium text-foreground hover:text-pitch-ink line-clamp-2">
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                    {t.reply_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {guest ? (
        <p className="text-center text-xs text-muted-foreground">
          Förhandsvisning ·{" "}
          <Link href="/sign-up" className="text-pitch-ink hover:underline">
            Skapa konto
          </Link>{" "}
          för brief, notiser och sparat lag.
        </p>
      ) : null}
    </div>
  );
}
