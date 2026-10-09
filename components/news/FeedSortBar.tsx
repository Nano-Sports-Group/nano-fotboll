"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type FeedSort = "for-you" | "latest" | "important";
export type FeedScope = "personal" | "allsvenskan";

type TabValue = "for-you" | "latest" | "important";

const TAB_OPTIONS: { value: TabValue; label: string }[] = [
  { value: "for-you", label: "För dig" },
  { value: "latest", label: "Senaste" },
  { value: "important", label: "Viktigt" },
];

const VISA_OPTIONS = [
  { value: "all", label: "Alla" },
  { value: "ai", label: "AI" },
  { value: "source", label: "Källor" },
] as const;

/**
 * Flödeskontroller — tabbarna växlar VY (scope+sort), inte bara sort.
 * För dig = /nyheter utan scope/sort. Senaste/Viktigt = hela Allsvenskan
 * med respektive sort. lag/kalla/event/visa behålls alltid; page nollas.
 */
export function FeedSortBar({
  sort,
  scope,
  visa,
}: {
  sort: FeedSort;
  scope: FeedScope;
  visa: "all" | "ai" | "source";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab: TabValue =
    scope === "allsvenskan" && sort === "important"
      ? "important"
      : scope === "allsvenskan" && sort === "latest"
        ? "latest"
        : "for-you";

  function buildTabHref(tab: TabValue): string {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    next.delete("scope");
    next.delete("sort");
    if (tab === "latest") {
      next.set("scope", "allsvenskan");
      next.set("sort", "latest");
    } else if (tab === "important") {
      next.set("scope", "allsvenskan");
      next.set("sort", "important");
    }
    // för-dig: varken scope eller sort sätts
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function setParam(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-3 mb-6">
      <SegmentedControl
        aria-label="Vy"
        options={TAB_OPTIONS}
        value={activeTab}
        onChange={(v) => router.push(buildTabHref(v))}
      />
      <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VISA_OPTIONS.map((opt) => {
          const active = visa === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setParam("visa", opt.value, "all")}
              // min-w-11 också: "AI" är två tecken och blev 39 px brett av
              // padding allena, trots rätt höjd.
              className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3.5 text-xs font-medium transition-colors touch-manipulation ${
                active
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        <Link
          href="/nyheter"
          className="inline-flex min-h-11 shrink-0 items-center ml-auto text-xs text-pitch-ink hover:underline"
        >
          Rensa
        </Link>
      </div>
    </div>
  );
}
