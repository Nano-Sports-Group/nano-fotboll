import Link from "next/link";
import type { PodLatestEpisode } from "@/lib/podcast/nano-api";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "idag";
  if (d === 1) return "igår";
  if (d < 30) return `${d} dagar sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
  });
}

/** Avsnittsrader från Nano Podcast API → /podcast/avsnitt/[id]. Bara metadata, aldrig RSS-text. */
export function NanoEpisodeList({
  episodes,
  teamNames,
}: {
  episodes: PodLatestEpisode[];
  teamNames: Map<string, string>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
      {episodes.map((ep) => {
        const art = ep.artworkUrl ?? ep.podcast.artworkUrl;
        const teams = ep.teams
          .map((s) => teamNames.get(s))
          .filter(Boolean)
          .slice(0, 3);
        return (
          <Link
            key={ep.id}
            href={`/podcast/avsnitt/${ep.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element -- tredjeparts-CDN:er
              <img
                src={art}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground line-clamp-2">
                {ep.title}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {ep.podcast.title} · {relTime(ep.publishedAt)}
                {teams.length > 0 && ` · ${teams.join(", ")}`}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
