"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { VERTICAL } from "@/lib/vertical";

/**
 * Dela via native share sheet (mobil) med kopiera-länk-fallback (desktop).
 * Länken taggas `utm_campaign=share_<sport>_<kind>_web` → proxy.ts sätter cookien
 * och mottagarens besök/signup/trial hamnar i utm_events. Regler: docs/DELNING.md.
 */
export function ShareButton({
  title,
  url,
  kind,
  variant = "label",
}: {
  title: string;
  url: string;
  kind: "article" | "match" | "team" | "player";
  variant?: "label" | "icon";
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const tagged = new URL(url);
    tagged.searchParams.set("utm_campaign", `share_${VERTICAL}_${kind}_web`);
    const shared = tagged.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shared });
        return;
      }
      await navigator.clipboard.writeText(shared);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Avbruten share-sheet är inte ett fel
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={share}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label={copied ? "Länk kopierad" : "Dela"}
      >
        {copied ? <Check className="size-5 text-pitch-ink" /> : <Share2 className="size-5" />}
      </button>
    );
  }

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-pitch/50 transition-colors"
      aria-label="Dela"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-pitch-ink" /> : <Share2 className="w-3.5 h-3.5" />}
      {copied ? "Länk kopierad" : "Dela"}
    </button>
  );
}
