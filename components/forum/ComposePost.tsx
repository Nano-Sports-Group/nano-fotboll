"use client";
import { SPORT } from "@/lib/vertical";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useDraft } from "@/hooks/useDraft";

type PostLabel = 'transfer' | 'taktik' | 'match' | 'rykte' | 'diskussion';

const LABELS: { id: PostLabel; emoji: string; text: string }[] = [
  { id: "diskussion", emoji: "💬", text: "Diskussion" },
  { id: "match",      emoji: "⚽", text: "Match" },
  { id: "transfer",   emoji: "✍️", text: "Transfer" },
  { id: "taktik",     emoji: "🧠", text: "Taktik" },
  { id: "rykte",      emoji: "🔥", text: "Rykte" },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface Props {
  parentId?: string;
  rootId?: string;
  teamSlug: string;
  sport?: string;
  onPost: (post: {
    content: string;
    label?: PostLabel;
    parentId?: string;
    rootId?: string;
    teamSlug: string;
    sport: string;
  }) => Promise<void>;
  placeholder?: string;
  showLabel?: boolean;
  initialContent?: string;
}

export default function ComposePost({
  parentId,
  rootId,
  teamSlug,
  sport = SPORT,
  onPost,
  placeholder = "Vad tänker du?",
  showLabel = !parentId, // only show label picker for root posts
  initialContent,
}: Props) {
  const { user } = useUser();
  // Autosparat utkast (mobil UX-regel 19). Nyckeln är per lag och per
  // tråd/svarsnivå — ett påbörjat svar hör inte hemma i en annan tråd, och
  // ett rotinlägg för Hammarby ska inte dyka upp på AIK:s forum.
  const [content, setContent, clearDraft] = useDraft(
    `forum.${teamSlug}.${rootId ?? "new"}.${parentId ?? "root"}`,
    initialContent ?? "",
  );
  const [label, setLabel] = useState<PostLabel | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  // Bara för initialerna i skrivrutan; namnet på inlägget sätts av servern (forumnamn, annars förnamn).
  const name = user.firstName ?? "Supporter";
  const max = 500;
  const remaining = max - content.length;

  async function handlePost() {
    if (!content.trim() || loading) return;
    setLoading(true);
    try {
      await onPost({ content: content.trim(), label, parentId, rootId, teamSlug, sport });
      // Utkastet rensas först när servern tagit emot texten — failar anropet
      // ligger den kvar, vilket är hela poängen med att spara den.
      clearDraft();
      setLabel(undefined);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-full bg-pitch flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
        {user.imageUrl ? (
          <Image src={user.imageUrl} alt="" width={36} height={36} className="rounded-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      <div className="flex-1">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, max))}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none border-b border-border/40 pb-2 focus:border-pitch/60 transition-colors"
        />

        {/* Label picker — only for root posts */}
        {showLabel && (
          <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
            {LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLabel(label === l.id ? undefined : l.id)}
                className={`inline-flex min-h-11 items-center gap-1 px-3 rounded-full text-xs font-medium border transition-all touch-manipulation ${
                  label === l.id
                    ? "bg-pitch/15 border-pitch/60 text-pitch-ink"
                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span>{l.emoji}</span>
                {l.text}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              remaining < 50
                ? remaining < 10
                  ? "text-destructive"
                  : "text-amber-500"
                : "text-muted-foreground"
            }`}
          >
            {remaining}
          </span>
          <button
            onClick={handlePost}
            disabled={!content.trim() || loading}
            data-cta="primary"
            className="inline-flex min-h-11 items-center rounded-full bg-pitch px-5 text-sm font-medium text-white transition-colors hover:bg-pitch/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Postar…" : "Posta"}
          </button>
        </div>
      </div>
    </div>
  );
}
