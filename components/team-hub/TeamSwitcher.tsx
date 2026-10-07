"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, Star, Check } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/TactileSheet";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";

export interface SwitcherTeam {
  name: string;
  slug: string;
  logo_url: string | null;
}

/**
 * Lagväxlare för lag-hubben: knapp → bottom sheet med "Dina lag"
 * (user_follows, serverhämtade) överst och alla lag under.
 * Rad-tap = byt visat lag (1 klick). Stjärnan = byt default-lag
 * (Clerk favoriteTeam via useFavoriteTeam — samma fält som onboarding).
 */
export function TeamSwitcher({
  teams,
  followedSlugs,
  currentSlug,
  onSelect,
}: {
  teams: SwitcherTeam[];
  followedSlugs: string[];
  currentSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { slug: favoriteSlug, setFavoriteTeam } = useFavoriteTeam();

  const current = useMemo(() => teams.find((t) => t.slug === currentSlug) ?? null, [teams, currentSlug]);
  const followedSet = useMemo(() => new Set(followedSlugs), [followedSlugs]);
  const mine = useMemo(
    () => teams.filter((t) => followedSet.has(t.slug) || t.slug === favoriteSlug),
    [teams, followedSet, favoriteSlug]
  );
  const others = useMemo(
    () => teams.filter((t) => !followedSet.has(t.slug) && t.slug !== favoriteSlug),
    [teams, followedSet, favoriteSlug]
  );

  const pick = (slug: string) => {
    onSelect(slug);
    setOpen(false);
  };

  const Row = ({ team }: { team: SwitcherTeam }) => {
    const isCurrent = team.slug === currentSlug;
    const isFavorite = team.slug === favoriteSlug;
    return (
      <div
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          isCurrent ? "bg-pitch/10" : "hover:bg-muted active:bg-muted"
        }`}
      >
        <button
          type="button"
          onClick={() => pick(team.slug)}
          className="flex flex-1 items-center gap-3 min-w-0 text-left touch-manipulation"
        >
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-card border border-border">
            {team.logo_url && (
              <Image src={team.logo_url} alt="" fill className="object-contain p-1" sizes="32px" />
            )}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{team.name}</span>
          {isCurrent && <Check className="h-4 w-4 shrink-0 text-pitch-ink" aria-label="Visas nu" />}
        </button>
        <button
          type="button"
          aria-label={isFavorite ? `${team.name} är ditt lag` : `Gör ${team.name} till ditt lag`}
          aria-pressed={isFavorite}
          onClick={() => void setFavoriteTeam(team.slug)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg touch-manipulation transition-colors hover:bg-muted"
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-pitch text-pitch-ink" : "text-muted-foreground"}`} />
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Byt lag"
        className="relative inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md text-[22px] sm:text-[28px] font-bold tracking-tight text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
      >
        <span className="truncate">{current?.name ?? currentSlug}</span>
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Byt lag</SheetTitle>
          <SheetDescription>Kika på ett annat lag — stjärnan gör det till ditt lag.</SheetDescription>
          <div className="mt-3 max-h-[60vh] overflow-y-auto pb-4">
            {mine.length > 0 && (
              <>
                <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Dina lag
                </p>
                {mine.map((t) => <Row key={t.slug} team={t} />)}
                <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Alla lag
                </p>
              </>
            )}
            {others.map((t) => <Row key={t.slug} team={t} />)}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
