"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import PostItem from "@/components/forum/PostItem";
import ComposeDrawer from "@/components/forum/ComposeDrawer";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import type { ForumPost } from "@/lib/types";
import { getSiteHost } from "@/lib/site-url";

interface Props {
  teamSlug: string;
  sport: string;
  initialPosts: ForumPost[];
  /** Från /artikel → "Diskutera": öppnar composern förifylld och taggar inlägget med artikeln. */
  articlePrefill?: { id: string; title: string; slug: string } | null;
}

export default function ForumClient({ teamSlug, sport, initialPosts, articlePrefill }: Props) {
  const { user } = useUser();
  const [posts, setPosts] = useState<ForumPost[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(!!articlePrefill);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/forum/posts?teamSlug=${teamSlug}&sport=${sport}&sort=hot`
      );
      if (res.ok) {
        const json = (await res.json()) as { posts: ForumPost[] };
        setPosts(json.posts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [teamSlug, sport]);

  // Ny serverdata (t.ex. efter router.refresh) ersätter listan — justeras under render, inte i en effect.
  const [prevInitial, setPrevInitial] = useState(initialPosts);
  if (initialPosts !== prevInitial) {
    setPrevInitial(initialPosts);
    setPosts(initialPosts);
  }

  usePullRefresh(refresh);
  useScrollRestoration(`forum:${teamSlug}`, !loading && posts.length > 0);

  async function handlePost(data: {
    content: string;
    label?: string;
    parentId?: string;
    rootId?: string;
    teamSlug: string;
    sport: string;
  }) {
    const res = await fetch("/api/forum/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: data.content,
        label: data.label ?? null,
        team_slug: data.teamSlug,
        sport: data.sport,
        article_id: articlePrefill?.id ?? null,
      }),
    });
    if (!res.ok) {
      toast.error("Det gick inte att skapa inlägget. Försök igen.");
      return;
    }
    const newPost = (await res.json()) as ForumPost;
    setPosts((prev) => [newPost, ...prev]);
  }

  // Initials from Clerk user name
  const userInitials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div>
      {/* Inline compose — Threads-style tap-to-open row */}
      {user && (
        <>
          <button
            onClick={() => setComposeOpen(true)}
            data-cta="primary"
            className="w-full flex min-h-11 items-center gap-3 px-4 py-3.5 border-b border-border/40 hover:bg-card/30 transition-colors text-left touch-manipulation"
            aria-label="Skriv ett inlägg"
          >
            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 text-[13px] font-semibold shrink-0 overflow-hidden">
              {user.imageUrl ? (
                <Image
                  src={user.imageUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-full object-cover"
                />
              ) : userInitials}
            </div>
            <span className="flex-1 text-[15px] text-muted-foreground/50">Vad tänker du på?</span>
            <span className="text-[13px] font-semibold text-pitch-ink px-3 py-1.5 rounded-full border border-pitch/30 shrink-0">
              Skriv
            </span>
          </button>
          <ComposeDrawer
            open={composeOpen}
            onOpenChange={setComposeOpen}
            teamSlug={teamSlug}
            sport={sport}
            onPost={handlePost}
            initialContent={
              articlePrefill
                ? `${articlePrefill.title}\n${getSiteHost()}/artikel/${articlePrefill.slug}\n\n`
                : undefined
            }
          />
        </>
      )}

      {loading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-border/40 px-4 py-4 flex gap-3">
              <div className="w-11 h-11 rounded-full bg-card skeleton-wave shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 w-28 rounded bg-card skeleton-wave" />
                <div className="h-3.5 w-full rounded bg-card skeleton-wave" />
                <div className="h-3.5 w-2/3 rounded bg-card skeleton-wave" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground text-sm">Inga inlägg ännu.</p>
          {user ? (
            <p className="text-sm text-foreground font-medium">
              Var den som startar diskussionen — skriv det första inlägget nedan.
            </p>
          ) : (
            <Link
              href="/sign-up"
              // text-black på Racing Green ger 2.5:1 — vit text är normen på
              // bg-pitch i övriga appen och ger 8.9:1.
              data-cta="primary"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-pitch px-5 text-sm font-bold text-white hover:bg-pitch/90 transition-colors"
            >
              Skapa konto för att skriva
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col py-1">
          {posts.map((post, i) => (
            <PostItem
              key={post.id}
              post={post}
              depth={0}
              showThread={post.reply_count > 0}
              onReply={() => refresh()}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
