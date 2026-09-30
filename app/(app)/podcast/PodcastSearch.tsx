"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, Quote, Lock } from "lucide-react";

interface EpisodeHit {
  id: string;
  title: string;
  showName: string | null;
  publishedAt: string | null;
  mentionedTeams: string[];
}

interface ClipHit {
  episodeId: string;
  episodeTitle: string;
  showName: string | null;
  publishedAt: string | null;
  quote: string;
  startSeconds: number | null;
}

function ts(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return ` · ${m}:${String(s).padStart(2, "0")}`;
}

/** Debounced sök: avsnitt (metadata) + PRO-gated citatklipp ur transkripten. */
export function PodcastSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EpisodeHit[] | null>(null);
  const [clips, setClips] = useState<ClipHit[]>([]);
  const [clipsGated, setClipsGated] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
      setHits(null);
      setClips([]);
      setClipsGated(false);
      return;
    }
    timer.current = setTimeout(() => {
      void fetch(`/api/podcast-search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d: { episodes?: EpisodeHit[]; clips?: ClipHit[]; clipsGated?: boolean }) => {
          setHits(d.episodes ?? []);
          setClips(d.clips ?? []);
          setClipsGated(d.clipsGated ?? false);
        })
        .catch(() => { setHits([]); setClips([]); })
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            // Laddningen tänds i händelsehanteraren, inte i effekten: det är
            // NÄTVERKSANROPET som är debouncat, inte återkopplingen. Låg den i
            // timeouten blev det 300 ms där inget hände och fältet kändes dött.
            if (e.target.value.trim().length >= 2) setLoading(true);
          }}
          placeholder="Sök avsnitt, podd eller lag …"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pitch/40"
          aria-label="Sök poddavsnitt"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {clips.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-pitch-ink uppercase tracking-wide mb-2">
            <Quote className="w-3.5 h-3.5" /> Sagt i poddarna
          </p>
          <div className="rounded-xl border border-pitch/30 bg-card divide-y divide-border/60">
            {clips.map((c, i) => (
              <Link
                key={`${c.episodeId}-${i}`}
                href={`/podcast/${c.episodeId}`}
                className="block px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <p className="text-sm text-foreground italic">&ldquo;{c.quote}&rdquo;</p>
                <p className="text-xs text-muted-foreground mt-1">
                  — {c.showName ?? "Podd"}: {c.episodeTitle}
                  {ts(c.startSeconds)}
                  {c.publishedAt && ` · ${new Date(c.publishedAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}`}
                </p>
              </Link>
            ))}
            {clipsGated && (
              <Link href="/prenumerera" className="flex items-center gap-2 px-4 py-3 text-sm text-pitch-ink hover:bg-muted/40 transition-colors">
                <Lock className="w-3.5 h-3.5" />
                Fler klipp ur transkripten kräver PRO — sök i allt som sägs om ditt lag
              </Link>
            )}
          </div>
        </div>
      )}

      {hits !== null && (
        <div className="mt-3 rounded-xl border border-border bg-card divide-y divide-border/60">
          {hits.length === 0 && !loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Inga avsnitt matchade — prova ett lagnamn eller poddens namn.
            </p>
          ) : (
            hits.map((ep) => (
              <Link
                key={ep.id}
                href={`/podcast/${ep.id}`}
                className="block px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <p className="text-sm font-medium text-foreground line-clamp-1">{ep.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ep.showName}
                  {ep.publishedAt && ` · ${new Date(ep.publishedAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}`}
                  {ep.mentionedTeams.length > 0 && ` · ${ep.mentionedTeams.slice(0, 3).join(", ")}`}
                </p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
