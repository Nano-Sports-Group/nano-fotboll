"use client";
import { SPORT } from "@/lib/vertical";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { X, MessageSquare, Sparkles } from "lucide-react";

interface ForumDigest {
  id: string;
  body: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

const DISMISSED_KEY = "athopia_forum_summary_dismissed";
const REFRESH_MS = 60 * 60 * 1000; // 60 min

function getNextHourMs(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function ForumSummaryPopup() {
  const pathname = usePathname();
  const [digest, setDigest] = useState<ForumDigest | null>(null);
  const [visible, setVisible] = useState(false);

  const onForumRoute = pathname?.startsWith("/forum") || pathname?.includes("/forum");

  const fetchDigest = useCallback(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const db = createClient(url, key);
    const { data } = await db
      .from("content_queue")
      .select("id, body, created_at, metadata")
      .eq("type", "digest")
      .eq("subtype", "forum_digest")
      .eq("status", "approved")
      .eq("sport", SPORT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const dismissed = typeof window !== "undefined" ? localStorage.getItem(DISMISSED_KEY) : null;
    if (dismissed === data.id) return;

    setDigest(data as ForumDigest);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!onForumRoute) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    fetchDigest();

    const delay = getNextHourMs();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const firstTimer = setTimeout(() => {
      fetchDigest();
      intervalId = setInterval(fetchDigest, REFRESH_MS);
    }, delay);

    return () => {
      clearTimeout(firstTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [onForumRoute, fetchDigest]);

  const dismiss = () => {
    if (digest && typeof window !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, digest.id);
    }
    setVisible(false);
  };

  if (!onForumRoute || !visible || !digest) return null;

  const teamName = (digest.metadata?.team_name as string) ?? "Forumet";
  const timeLabel = new Date(digest.created_at).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });

  return (
    // Icke-modal avisering: den blockerar inte sidan, så den ska INTE fånga
    // fokus. Rätt behandling är en artig live-region som skärmläsare läser upp
    // när den dyker upp, utan att avbryta det användaren håller på med.
    <div
      role="status"
      aria-live="polite"
      aria-label="Forumsammanfattning"
      className="fixed bottom-20 right-4 z-50 w-80 md:bottom-6 md:right-6 md:w-96"
    >
      <div className="rounded-xl border border-white/10 bg-[#111] shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pitch/20">
              <Sparkles className="h-3 w-3 text-pitch-ink" />
            </div>
            <span className="text-xs font-medium text-white/60">AI · Senaste timmen · {timeLabel}</span>
          </div>
          <button
            onClick={dismiss}
            className="rounded p-1 text-white/40 transition-colors hover:text-white/80"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-pitch-ink" />
            <span className="text-xs font-semibold text-white/80">{teamName}</span>
          </div>
          <p className="text-sm leading-relaxed text-white/70">{digest.body}</p>
        </div>
      </div>
    </div>
  );
}
