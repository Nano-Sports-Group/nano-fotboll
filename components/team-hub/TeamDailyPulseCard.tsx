import { vertical } from "@/lib/vertical";
import { Newspaper, Sparkles } from "lucide-react";
import type { TeamDailyPulse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

function toneClass(tone: TeamDailyPulse["tone"]) {
  if (tone === "strong") return "border-pitch/30 bg-pitch/5";
  if (tone === "watch") return "border-amber-500/30 bg-amber-500/5";
  return "border-border bg-card";
}

function dateLabel(value: string) {
  if (!value) return "Idag";
  return new Date(`${value}T12:00:00`).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
  });
}

export function TeamDailyPulseCard({ pulse }: { pulse: TeamDailyPulse | null }) {
  if (!pulse) return null;

  const isPostMatchHold = pulse.matchContextLabel === "post_match_hold";

  return (
    <Card className={`overflow-hidden ${toneClass(pulse.tone)}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-pitch-ink" />
            {vertical.productName} idag
          </div>
          <span className="text-xs text-muted-foreground">{dateLabel(pulse.pulseDate)}</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold leading-snug text-foreground text-balance">{pulse.headline}</h2>
          <p className="text-sm font-medium text-muted-foreground">{pulse.dek}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{pulse.body}</p>
        </div>

        {isPostMatchHold && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <Newspaper className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Matchdetaljer och spelarbetyg hålls separat från dagens lagbild.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
