"use client";

import Image from "next/image";
import { BrandBadge, AvatarWriterBadge } from "@/components/brand/BrandBadge";
import { getTeamColors } from "@/lib/team-colors";

export interface PublicProfile {
  clerk_user_id: string;
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean;
  role?: "reader" | "columnist" | "admin";
  /** entities.slug — favoritlag, driver lagfärgad ring + banner. */
  favourite_team_id?: string | null;
  created_at: string;
  /** "spotify" | "apple" | "browser" | null — null = Spotify-först-fallback. */
  preferred_podcast_player?: string | null;
}

function memberSince(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

const FALLBACK_GRADIENT = "linear-gradient(135deg, #4DA3FF 0%, #0B2A6B 100%)";

function teamGradient(slug: string | null | undefined, angle: number): string | null {
  if (!slug) return null;
  const c = getTeamColors(slug);
  const stops = c.gradientStops ?? [c.primary, c.secondary];
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export function ProfileCard({ profile }: { profile: PublicProfile }) {
  const name = profile.nickname ?? profile.display_name ?? "Anonym";
  const isColumnist = profile.role === "columnist" || profile.role === "admin";
  const isAdmin = profile.role === "admin";
  const ringGradient = teamGradient(profile.favourite_team_id, 135);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* Topp ~30% — lagfärgad gradient om favoritlag finns, annars generisk */}
      <div className="relative h-28" style={{ background: teamGradient(profile.favourite_team_id, 90) ?? FALLBACK_GRADIENT }} aria-hidden />

      {/* Rund profilbild, centrerad, överlappar gradienten */}
      <div className="flex flex-col items-center px-6 pb-7 -mt-12">
        <div className="relative">
          {/* Lagfärgad ring runt avataren (samma mönster som forumets avatarring) */}
          <div className="rounded-full p-[3px]" style={ringGradient ? { background: ringGradient } : undefined}>
            <div className="rounded-full ring-4 ring-card bg-card">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={name}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
                  {initials(name)}
                </div>
              )}
            </div>
          </div>

          {/* Writer-badge (journalist/krönikör) — uppe till höger på avataren */}
          {isColumnist && <AvatarWriterBadge className="ring-card" />}
        </div>

        {/* Nickname + verifierad / staff */}
        <div className="mt-4 flex items-center gap-1.5">
          <h2 className="text-xl font-semibold text-foreground text-balance">{name}</h2>
          {profile.verified && <BrandBadge kind="verified" size="md" />}
          {isAdmin && <BrandBadge kind="star" size="md" />}
        </div>
        {isColumnist && (
          <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-pitch-ink">
            Journalist
          </span>
        )}

        {/* Medlem sedan */}
        <p className="mt-1 text-xs text-muted-foreground">
          Medlem sedan {memberSince(profile.created_at)}
        </p>

        {/* Bio */}
        {profile.bio && (
          <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-foreground/80">
            {profile.bio}
          </p>
        )}
      </div>
    </div>
  );
}
