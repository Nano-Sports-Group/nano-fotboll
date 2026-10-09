"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TAGS = [
  { id: "hot", label: "Hetast" },
  { id: "latest", label: "Senaste" },
  { id: "transfers", label: "Transfers" },
  { id: "taktik", label: "Taktik" },
  { id: "match", label: "Match" },
] as const;

export default function TagFilter({ active, onChange }: { active: string; onChange?: (tag: string) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(tag: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", tag);
    router.push(`?${params.toString()}`);
    onChange?.(tag);
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
      {TAGS.map((tag) => (
        <button
          key={tag.id}
          onClick={() => select(tag.id)}
          className={`shrink-0 px-3.5 min-h-11 sm:min-h-8 inline-flex items-center rounded-full text-xs font-medium border transition-colors touch-manipulation ${
            active === tag.id
              ? "bg-white text-neutral-900 border-white shadow-sm"
              : "border-border/60 text-muted-foreground hover:border-pitch hover:text-pitch-ink"
          }`}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}
