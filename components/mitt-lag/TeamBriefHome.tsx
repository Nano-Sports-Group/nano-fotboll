import { vertical } from "@/lib/vertical";
import Link from "next/link";

import type { HomeBrief } from "@/lib/newsletter/team-brief";

function dateLabel(value: string) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
  });
}

function ctaHref(destination: string) {
  if (destination.startsWith("http") || destination.startsWith("/")) return destination;
  return `/${destination}`;
}

export function TeamBriefHome({
  brief,
  teamName,
}: {
  brief: HomeBrief;
  teamName: string;
}) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-card overflow-hidden" aria-label={`${vertical.productName} idag`}>
      <div className="px-4 sm:px-5 py-4 sm:py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vertical.productName} idag
          </p>
          <span className="text-xs text-muted-foreground">{dateLabel(brief.briefDate)}</span>
        </div>

        {brief.leagueHeadlines.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Allsvenskan
            </h2>
            <ul className="mt-2 space-y-2">
              {brief.leagueHeadlines.map((item) => (
                <li key={item.text} className="text-sm leading-relaxed text-foreground">
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="text-xl sm:text-2xl font-bold leading-snug text-foreground text-balance">
          {brief.subject}
        </h2>
        {brief.preheader && (
          <p className="mt-2 text-sm font-medium text-muted-foreground">{brief.preheader}</p>
        )}
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {teamName}
        </p>
        {brief.stateLine && (
          <p className="mt-3 text-sm text-foreground/90">{brief.stateLine}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
          {brief.lead}
        </p>
        {brief.nextUp && (
          <p className="mt-3 text-sm text-muted-foreground">{brief.nextUp}</p>
        )}
        {brief.cta && (
          <Link
            href={ctaHref(brief.cta.destination)}
            className="mt-4 inline-flex text-sm font-medium text-pitch-ink hover:underline"
          >
            {brief.cta.label}
          </Link>
        )}
      </div>
    </section>
  );
}
