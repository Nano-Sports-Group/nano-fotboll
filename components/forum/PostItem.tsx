"use client";

import { useState, useOptimistic } from "react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { Heart, MessageCircle, Repeat2, Share2, Flag, ChevronDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ForumPost } from "@/lib/types";
import QuoteBox from "./QuoteBox";
import ComposeDrawer from "./ComposeDrawer";
import { ProfileLink } from "@/components/profile/ProfilePopup";
import { AvatarWriterBadge } from "@/components/brand/BrandBadge";
import { getTeamColors, getTeamShort, getTeamInk } from "@/lib/team-colors";

const PREVIEW_LENGTH = 220;

const LABEL_STYLES: Record<string, { bg: string; text: string; emoji: string }> = {
  transfer:   { bg: "bg-blue-500/10 border-blue-500/30",   text: "text-blue-400",   emoji: "✍️" },
  taktik:     { bg: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400", emoji: "🧠" },
  match:      { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", emoji: "⚽" },
  rykte:      { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", emoji: "🔥" },
  diskussion: { bg: "bg-zinc-700/30 border-zinc-600/30",   text: "text-muted-foreground",   emoji: "💬" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  post: ForumPost;
  depth?: number;
  onReply?: (post: ForumPost) => void;
  index?: number;
}

export default function PostItem({
  post,
  depth = 0,
  onReply,
  index = 0,
}: Props) {
  const { user } = useUser();
  const [replyOpen, setReplyOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [reported, setReported] = useState(false);
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    post.like_count,
    (s: number, d: number) => s + d
  );
  const [optimisticReposts, addOptimisticRepost] = useOptimistic(
    post.repost_count,
    (s: number, d: number) => s + d
  );

  const prefersReduced = useReducedMotion();
  const animDelay = depth === 0 ? Math.min(index * 0.055, 0.28) : 0;
  const needsTruncation = post.content.length > PREVIEW_LENGTH;
  const displayContent =
    needsTruncation && !expanded
      ? post.content.slice(0, PREVIEW_LENGTH).trimEnd() + "…"
      : post.content;
  const label = post.label ? LABEL_STYLES[post.label] : null;
  const teamShort = getTeamShort(post.author_team);
  const teamColors = teamShort ? getTeamColors(post.author_team) : null;
  const teamInk = getTeamInk(post.author_team);
  const isColumnist = post.author_role === "columnist" || post.author_role === "admin";

  async function toggleLike() {
    if (!user) return;
    const next = !liked;
    addOptimisticLike(next ? 1 : -1);
    setLiked(next);
    if (next) { setLikeAnimating(true); setTimeout(() => setLikeAnimating(false), 400); }
    try {
      const res = await fetch("/api/forum/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      addOptimisticLike(next ? -1 : 1);
      setLiked(!next);
    }
  }

  async function toggleRepost() {
    if (!user) return;
    const next = !reposted;
    addOptimisticRepost(next ? 1 : -1);
    setReposted(next);
    try {
      const res = await fetch("/api/forum/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      addOptimisticRepost(next ? -1 : 1);
      setReposted(!next);
    }
  }

  async function share() {
    const url = `${window.location.origin}/forum/${post.team_slug}/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard.writeText(url);
    } catch {}
  }

  async function handleReport() {
    if (!user || reported) return;
    setReported(true);
    try {
      await fetch("/api/forum/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
    } catch { setReported(false); }
  }

  async function handleReply(data: {
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
        parent_id: post.id,
        root_id: post.root_id ?? post.id,
        team_slug: data.teamSlug,
        sport: data.sport,
        depth: (post.depth ?? 0) + 1,
      }),
    });
    if (res.ok) {
      const newPost = await res.json();
      setReplyOpen(false);
      onReply?.(newPost);
    }
  }

  return (
    <>
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 12 }}
        whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.28, delay: animDelay, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={depth > 0 ? "ml-12" : ""}
      >
        <div
          className={
            depth === 0
              ? "border-b border-border/40 px-4 py-4 hover:bg-card/40 transition-colors"
              : "pl-3 py-3 border-l-2 border-border/30 ml-1"
          }
        >
          <div className="flex gap-3">
            {/* Avatar + thread line — lagfärgad gradientring visar supporteridentitet */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative">
                <div
                  className="rounded-full p-[2px]"
                  style={
                    teamColors
                      ? {
                          background: teamColors.gradientStops
                            ? `linear-gradient(135deg, ${teamColors.gradientStops.join(", ")})`
                            : `linear-gradient(135deg, ${teamColors.primary}, ${teamColors.secondary})`,
                        }
                      : undefined
                  }
                >
                  <ProfileLink
                    userId={post.author_id}
                    className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 text-sm font-semibold overflow-hidden relative hover:opacity-90 transition-opacity border-2 border-background"
                  >
                    {post.author_avatar ? (
                      <Image src={post.author_avatar} alt="" fill className="object-cover" />
                    ) : (
                      initials(post.author_name)
                    )}
                  </ProfileLink>
                </div>
                {isColumnist && <AvatarWriterBadge size="sm" />}
              </div>
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ProfileLink
                    userId={post.author_id}
                    className="text-[15px] font-semibold text-foreground hover:underline leading-tight"
                  >
                    {post.author_name}
                  </ProfileLink>
                  {teamShort && (
                    <span
                      className="team-ink text-[12px] font-semibold leading-tight"
                      style={
                        {
                          "--team-ink-light": teamInk.light,
                          "--team-ink-dark": teamInk.dark,
                        } as React.CSSProperties
                      }
                      title={`Supportrar ${post.author_team}`}
                    >
                      ({teamShort})
                    </span>
                  )}
                  <span className="text-[13px] text-muted-foreground">
                    {timeAgo(post.created_at)}
                  </span>
                  {post.pinned && (
                    <span className="text-xs font-medium text-pitch-ink bg-pitch/10 px-1.5 py-0.5 rounded-full">
                      📌 Fäst
                    </span>
                  )}
                </div>
                <button
                  aria-label="Fler alternativ"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                >
                  <MoreHorizontal className="w-[18px] h-[18px]" />
                </button>
              </div>

              {/* Label badge */}
              {label && post.label && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border mb-2 ${label.bg} ${label.text}`}
                >
                  {label.emoji}
                  {post.label.charAt(0).toUpperCase() + post.label.slice(1)}
                </span>
              )}

              {/* Content */}
              {/* Löpande flöde: ett svar visar vad det svarar på inline (QuoteBox),
                  i stället för att nästlas under sitt ursprungsinlägg i en tråd. */}
              {post.parent_post && (
                <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageCircle className="w-3 h-3" aria-hidden />
                  Svar till {post.parent_post.author_name}
                </div>
              )}
              <Link
                href={`/forum/${post.team_slug}/${post.id}`}
                className="block"
                onClick={(e) => needsTruncation && !expanded && e.preventDefault()}
              >
                <p className="text-[15px] text-foreground leading-[1.55] whitespace-pre-wrap">
                  {displayContent}
                </p>
              </Link>
              {post.parent_post && <QuoteBox post={post.parent_post} />}

              {needsTruncation && (
                <AnimatePresence initial={false}>
                  {!expanded ? (
                    <button
                      onClick={() => setExpanded(true)}
                      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                    >
                      Läs mer <ChevronDown className="w-3 h-3" />
                    </button>
                  ) : (
                    <motion.div key="expand-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                      <Link href={`/forum/${post.team_slug}/${post.id}`} className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Visa inlägg →
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {post.quoted_post && <QuoteBox post={post.quoted_post} />}

              {post.images && post.images.length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {post.images.map((src, i) => (
                    <Image key={i} src={src} alt="" width={300} height={192} className="rounded-xl max-h-52 object-cover" />
                  ))}
                </div>
              )}

              {/* Threads-style action bar */}
              <div className="flex items-center gap-1 mt-3 -ml-2">
                <button
                  aria-label="Svara"
                  onClick={() => user && setReplyOpen(true)}
                  className="flex items-center gap-1.5 min-h-[44px] px-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-all touch-manipulation"
                >
                  <MessageCircle className="w-[19px] h-[19px]" />
                  {post.reply_count > 0 && <span className="text-[13px] tabular-nums">{post.reply_count}</span>}
                </button>

                <button
                  aria-label="Repost"
                  onClick={toggleRepost}
                  className={`flex items-center gap-1.5 min-h-[44px] px-2 rounded-full transition-all touch-manipulation ${
                    reposted ? "text-emerald-400" : "text-muted-foreground hover:text-emerald-400 hover:bg-card"
                  }`}
                >
                  <Repeat2 className="w-[19px] h-[19px]" />
                  {optimisticReposts > 0 && <span className="text-[13px] tabular-nums">{optimisticReposts}</span>}
                </button>

                <button
                  aria-label={liked ? "Ta bort gilla-markering" : "Gilla"}
                  onClick={toggleLike}
                  className={`flex items-center gap-1.5 min-h-[44px] px-2 rounded-full transition-all touch-manipulation ${
                    liked ? "text-rose-400" : "text-muted-foreground hover:text-rose-400 hover:bg-card"
                  }`}
                >
                  <Heart
                    className={`w-[19px] h-[19px] ${liked ? "fill-current" : ""}`}
                    style={{ transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1)", transform: likeAnimating ? "scale(1.4)" : "scale(1)" }}
                  />
                  {optimisticLikes > 0 && <span className="text-[13px] tabular-nums">{optimisticLikes}</span>}
                </button>

                <button
                  aria-label="Dela"
                  onClick={share}
                  className="flex items-center gap-1.5 min-h-[44px] px-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-all touch-manipulation"
                >
                  <Share2 className="w-[19px] h-[19px]" />
                </button>

                <button
                  aria-label="Rapportera"
                  onClick={handleReport}
                  disabled={reported}
                  className={`flex items-center gap-1.5 min-h-[44px] px-2 ml-auto rounded-full transition-all touch-manipulation ${
                    reported ? "text-amber-400" : "text-muted-foreground/60 hover:text-amber-400 hover:bg-card"
                  }`}
                >
                  <Flag className="w-[15px] h-[15px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <ComposeDrawer
        open={replyOpen}
        onOpenChange={setReplyOpen}
        parentId={post.id}
        rootId={post.root_id ?? post.id}
        teamSlug={post.team_slug ?? ""}
        sport={post.sport}
        replyTo={post.author_name}
        onPost={handleReply}
      />
    </>
  );
}
