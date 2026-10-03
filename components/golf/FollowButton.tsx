"use client";

import { Check, Plus } from "lucide-react";
import { useGolfFollows } from "@/hooks/useGolfFollows";
import { isFollowing, type FollowKind } from "@/lib/golf/follows";

/**
 * Följ en spelare eller en tour. Fungerar utan konto (valet sparas på enheten och förs över vid
 * inloggning). `compact` är den lilla knappen i en lista; annars sidans primära handling.
 */
export function FollowButton({ kind, slug, name, compact = false }: { kind: FollowKind; slug: string; name: string; compact?: boolean }) {
  const { follows, isLoaded, toggle } = useGolfFollows();
  const on = isLoaded && isFollowing(follows, kind, slug);
  const Icon = on ? Check : Plus;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => toggle(kind, slug)}
        aria-pressed={on}
        aria-label={on ? `Sluta följa ${name}` : `Följ ${name}`}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-150 active:scale-[0.94] touch-manipulation ${
          on ? "border-transparent bg-pitch text-white" : "border-border bg-card text-foreground hover:border-pitch/40"
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle(kind, slug)}
      aria-pressed={on}
      data-cta="primary"
      className={`inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[transform,background-color] duration-150 active:scale-[0.97] touch-manipulation ${
        on ? "border border-border bg-card text-foreground" : "bg-pitch text-white"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {on ? "Följer" : `Följ ${name}`}
    </button>
  );
}
