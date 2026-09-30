import { vertical } from "@/lib/vertical";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { canAccess, type Plan } from "@/lib/access-rules";
import type { DailyEpisode, TeamPulse } from "@/lib/team-hub/queries";
import { DailyPodcastPlayer } from "@/components/team-hub/DailyPodcastPlayer";

function contextLabel(label: string | null) {
  if (label === "pre_match") return "Inför match";
  if (label === "post_match_hold") return "Efter match";
  return "Dagsläge";
}

function dateLabel(value: string) {
  if (!value) return "Idag";
  return new Date(`${value}T12:00:00`).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
  });
}

/** Daily-podcast på hemmet. Lagläget kommer från TeamBriefArtifact, inte pulse. */
export function TeamHubBriefRitual({
  pulse,
  dailyEpisode,
  plan,
}: {
  pulse: TeamPulse | null;
  dailyEpisode?: DailyEpisode | null;
  plan: Plan;
}) {
  const episode = dailyEpisode ?? null;
  if (!pulse && !episode) return null;

  const hasFull = pulse ? canAccess("aiSummaries", plan) : false;
  const ctx = pulse ? contextLabel(pulse.match_context_label) : null;

  return (
    <div className="space-y-4 mt-6 mb-5">
      {episode && (
        <DailyPodcastPlayer episode={episode} plan={plan} className="mx-4 sm:mx-6" />
      )}

      {pulse && (
        <section
          className="mx-4 sm:mx-6 rounded-xl border border-pitch/25 bg-gradient-to-br from-pitch/8 via-card to-card overflow-hidden"
          aria-label={`${vertical.productName} idag`}
        >
          <div className="px-4 sm:px-5 py-4 sm:py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-pitch-ink" aria-hidden />
                {vertical.productName} idag · {ctx}
              </div>
              <span className="text-xs text-muted-foreground">{dateLabel(pulse.pulse_date)}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold leading-snug text-foreground text-balance">{pulse.headline}</h2>
            {pulse.dek && (
              <p className="mt-2 text-sm font-medium text-muted-foreground">{pulse.dek}</p>
            )}

            {hasFull ? (
              <p className="mt-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{pulse.body}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Fullständig dagens brief kräver PRO.{" "}
                <Link href="/prenumerera" className="font-medium text-pitch-ink hover:underline">
                  Uppgradera
                </Link>
              </p>
            )}

            {hasFull && pulse.match_context_label === "post_match_hold" && (
              <p className="mt-3 text-xs text-muted-foreground">
                Matchdetaljer och spelarbetyg finns på{" "}
                <Link href="/nyheter" className="text-pitch-ink hover:underline">
                  matchsidan
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
