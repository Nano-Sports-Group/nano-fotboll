"use client";
import { SPORT } from "@/lib/vertical";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { useUser } from "@clerk/nextjs";

interface Post {
  id: string;
  content: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  parent_id: string | null;
}

export function MatchForum({ fixtureId, homeName, awayName }: {
  fixtureId: number;
  homeName: string;
  awayName: string;
}) {
  const { user } = useUser();
  const teamSlug = `match-${fixtureId}`;
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const r = await fetch(`/api/forum/posts?teamSlug=${teamSlug}&sport=football&sort=new`);
      const j = await r.json();
      setPosts((j.posts ?? []) as Post[]);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [teamSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim(), team_slug: teamSlug, sport: SPORT, label: "match" }),
      });
      setText("");
      await fetchPosts();
    } catch { /* ignore */ } finally {
      setPosting(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground text-balance">
          Diskussion · {homeName} vs {awayName}
        </h2>
        <span className="text-xs text-muted-foreground ml-auto">{posts.length} inlägg</span>
      </div>

      {/* Inläggsruta */}
      {user ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={500}
            placeholder="Vad tänker du om matchen?"
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-pitch transition-colors"
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="rounded-xl bg-pitch px-3 py-2 text-white disabled:opacity-40 transition-opacity hover:bg-pitch/90 touch-manipulation"
            aria-label="Skicka"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          <Link href="/sign-in" className="text-pitch-ink hover:underline">Logga in</Link> för att delta i diskussionen
        </p>
      )}

      {/* Flöde */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Var först med att kommentera matchen!
          </p>
        ) : posts.map(p => (
          <div key={p.id} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2">
              {p.author_avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.author_avatar} alt="" className="w-5 h-5 rounded-full" />
              )}
              <span className="text-xs font-semibold text-foreground">{p.author_name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{fmt(p.created_at)}</span>
            </div>
            <p className="text-sm text-foreground/90 leading-snug">{p.content}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
