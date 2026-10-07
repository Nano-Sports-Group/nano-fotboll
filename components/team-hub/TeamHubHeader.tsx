"use client";

import { useTransition } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { TeamSwitcher, type SwitcherTeam } from "@/components/team-hub/TeamSwitcher";
import { FollowButton } from "@/components/dashboard/follow-button";
import { LargeTitleHeader } from "@/components/ui/LargeTitleHeader";
import { StatNumber } from "@/components/ui/StatNumber";
import { Card as TactileCard } from "@/components/ui/TactileCard";
import type { TeamSeasonRow } from "@/lib/team-hub/queries";
import { formLetter, formLabel } from "@/lib/form-letter";
import { getTeamColors, getTeamShort } from "@/lib/team-colors";

// Global Header är sticky h-12 (48px). TeamNav är sticky top-12 och ~44px
// hög — kompaktraden fastnar under båda.
const HEADER_OFFSET = 92;

/**
 * TeamHubHeader — klientlagret ovanpå den serverrenderade lag-hubben.
 * Serverdata in via props (ingen client-fetch). Ansvarar för lagväxling
 * (navigerar till /lag/{slug}, behåller aktiv sektion), följ-knapp, large-title
 * och nyckeltal. Data hämtas i page.tsx (getTeamHub) och skickas hit.
 */
export function TeamHubHeader({
  teams,
  followedSlugs,
  currentSlug,
  team,
  position,
  league,
  form,
  stats,
  entityId,
  initialFollowing,
}: {
  teams: SwitcherTeam[];
  followedSlugs: string[];
  currentSlug: string;
  team: { name: string; logo_url: string | null };
  position: number | null;
  /** Lagets liga — hockey har två. */
  league: string;
  form: ("W" | "D" | "L")[];
  stats: TeamSeasonRow | null;
  entityId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const goToTeam = (slug: string) => {
    if (slug === currentSlug) return;
    // Behåll sektionen vid lagbyte: står du på AIK:s statistik ska Djurgårdens
    // statistik vara nästa vy. Tidigare bars detta av `?tab=`, men sektionerna
    // är riktiga routes nu — så vi flyttar över path-suffixet i stället.
    const suffix = pathname.startsWith(`/lag/${currentSlug}`)
      ? pathname.slice(`/lag/${currentSlug}`.length)
      : "";
    router.push(`/lag/${slug}${suffix}`);
  };

  const refresh = () => startTransition(() => router.refresh());

  return (
    <>
      <LargeTitleHeader
        title={team.name}
        stickyOffset={HEADER_OFFSET}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              aria-label="Uppdatera lagdata"
              // Mobil: dra-för-att-uppdatera gör samma sak, och knappen kapade lagnamnet ("Frölu…").
              className="hidden sm:inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 transition-colors touch-manipulation active:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Uppdatera</span>
            </button>
            <FollowButton entityId={entityId} initialFollowing={initialFollowing} />
          </div>
        }
        titleContent={
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-card border border-border shrink-0">
              {team.logo_url ? (
                <Image src={team.logo_url} alt="" fill className="object-contain p-1.5" sizes="56px" />
              ) : (
                // Ingen logotyp i källan (hela hockeyn): kortnamn i klubbfärg i stället för en tom ruta.
                <TeamMonogram slug={currentSlug} name={team.name} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <TeamSwitcher
                  teams={teams}
                  followedSlugs={followedSlugs}
                  currentSlug={currentSlug}
                  onSelect={goToTeam}
                />
              </div>
              <div className="flex items-center gap-3 mt-1">
                {position && <span className="team-ink text-xs font-bold">#{position} i {league}</span>}
                <FormDots form={form} />
              </div>
            </div>
          </div>
        }
      />

      {stats && (
        // Sex tal låg tidigare i sex stora kort över två rader — samma
        // information som en enda tabellrad, på ~200px höjd. Nu en rad som
        // ryms i ett svep och lämnar plats åt lagets faktiska innehåll.
        <div className="px-4 sm:px-6 pt-1">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <KeyStat label="Poäng" value={stats.points} accent />
            <KeyStat label="Spelade" value={stats.played} />
            <KeyStat label="Vinster" value={stats.wins} />
            <KeyStat label="Gjorda" value={stats.goals_for} />
            <KeyStat label="Insläppta" value={stats.goals_against} />
            <KeyStat label="Målskillnad" value={stats.goal_diff} signed />
          </div>
        </div>
      )}
    </>
  );
}

function FormDots({ form }: { form: ("W" | "D" | "L")[] }) {
  const map = { W: "bg-success text-success-foreground", D: "bg-muted text-foreground", L: "bg-red-500/20 text-destructive-ink" };
  if (form.length === 0) return null;
  return (
    <div className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={formLabel(r)}
          aria-label={formLabel(r)}
          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${map[r]}`}
        >
          {formLetter(r)}
        </span>
      ))}
    </div>
  );
}

function KeyStat({ label, value, accent, signed }: { label: string; value: number | null; accent?: boolean; signed?: boolean }) {
  return (
    <TactileCard className="rounded-xl p-2.5 text-center">
      {value == null ? (
        <p className={`text-xl font-bold ${accent ? "text-pitch-ink" : "text-foreground"}`}>–</p>
      ) : (
        <StatNumber
          value={value}
          format={signed ? { signDisplay: "exceptZero" as const } : undefined}
          className={`text-xl ${accent ? "text-pitch-ink" : "text-foreground"}`}
        />
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </TactileCard>
  );
}

function TeamMonogram({ slug, name }: { slug: string; name: string }) {
  const colors = getTeamColors(slug);
  const label = getTeamShort(slug) ?? name.slice(0, 3).toUpperCase();
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center font-heading font-bold tracking-tight"
      // Svart huvudfärg (AIK, Brynäs, Luleå): andra klubbfärgen bär bokstäverna.
      style={{ background: colors.primary, color: colors.primary === "#111111" ? colors.secondary : colors.text, fontSize: label.length > 3 ? 13 : 16 }}
    >
      {label}
    </span>
  );
}
