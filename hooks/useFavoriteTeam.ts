"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { VERTICAL } from "@/lib/vertical";
import { favoriteFromMeta, onboardingDoneFromMeta, withFavorite, withOnboardingDone } from "@/lib/favorite-meta";

const LS_KEY = "athopia_favorite_team";
const LS_ONBOARDING_KEY = "athopia_onboarding_done";

/** Hur länge vi väntar på Clerk innan vi degraderar till gästläge. */
const CLERK_LOAD_TIMEOUT_MS = 5000;

export interface FavoriteTeamState {
  slug: string | null;
  isLoaded: boolean;
  /** teamId (entities.id, uuid) synkar user_feed_config.followed_team_ids server-side. */
  setFavoriteTeam: (slug: string, teamId?: string) => Promise<void>;
  clearFavoriteTeam: () => Promise<void>;
  needsOnboarding: boolean;
  markOnboardingDone: () => void;
}

/**
 * Enda skrivvägen till server-personalisering. Utan detta anrop desyncar
 * /api/feed (som filtrerar på followed_team_ids) från vad Clerk-metadata/
 * localStorage visar i UI — historiskt bugg: TeamSelectionModal bytte bara
 * Clerk-slug, aldrig DB-arrayen.
 */
async function syncFollowedTeam(teamId: string): Promise<void> {
  try {
    await fetch("/api/feed/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followed_team_ids: [teamId] }),
    });
  } catch {
    // Icke-kritiskt för UI — feed hämtar in vid nästa lyckade sync
  }
}

/** Growth attribution: team_selected once per attributed campaign. */
async function recordTeamSelectedMilestone(): Promise<void> {
  try {
    await fetch("/api/utm/milestone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "team_selected", path: "/onboarding" }),
      keepalive: true,
    });
  } catch {
    // Icke-kritiskt — funnel fortsätter utan milstolpe
  }
}

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_[A-Za-z0-9+/=]+$/);

function useLocalFavoriteTeam(): FavoriteTeamState {
  const [slug, setSlug] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(LS_KEY);
      const done = window.localStorage.getItem(LS_ONBOARDING_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
      if (stored) setSlug(stored);
      setNeedsOnboarding(!done && !stored);
    }
    setIsLoaded(true);
  }, []);

  const setFavoriteTeam = useCallback(async (newSlug: string, teamId?: string) => {
    setSlug(newSlug);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEY, newSlug);
      window.localStorage.setItem(LS_ONBOARDING_KEY, "1");
    }
    setNeedsOnboarding(false);
    // Ingen Clerk-session i lokalt läge → /api/feed/config kräver auth, hoppa över.
  }, []);

  const clearFavoriteTeam = useCallback(async () => {
    setSlug(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_KEY);
    }
  }, []);

  const markOnboardingDone = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_ONBOARDING_KEY, "1");
    }
    setNeedsOnboarding(false);
  }, []);

  return { slug, isLoaded, setFavoriteTeam, clearFavoriteTeam, needsOnboarding, markOnboardingDone };
}

function useClerkFavoriteTeam(): FavoriteTeamState {
  const { user, isLoaded: clerkLoaded } = useUser();
  const [slug, setSlug] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

  /**
   * Om Clerk-skriptet aldrig laddar (blockerat, offline, nere) blir clerkLoaded
   * aldrig true — och konsumenter som MittLagGuestPreview fastnar i "Laddar…"
   * för alltid på appens primära flik. Efter CLERK_LOAD_TIMEOUT_MS faller vi
   * tillbaka på localStorage och visar gästupplevelsen i stället för att hänga.
   */
  useEffect(() => {
    if (clerkLoaded) return;
    const t = setTimeout(() => setClerkTimedOut(true), CLERK_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [clerkLoaded]);

  // Initialisera från Clerk metadata (inloggad) eller localStorage (gäst)
  useEffect(() => {
    if (!clerkLoaded && !clerkTimedOut) return;

    if (user) {
      const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
      const clerkSlug = favoriteFromMeta(meta, VERTICAL);
      if (clerkSlug) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
        setSlug(clerkSlug);
        setIsLoaded(true);
        return;
      }
      // Onboarding avklarad UTAN lagval. markOnboardingDone() persisterar just
      // det här fältet till Clerk för att gälla på alla enheter — men läsvägen
      // tittade bara i localStorage, som är enhetsbunden. Följden: den som
      // hoppade över lagvalet fick lagvalsmodalen igen i varje ny webbläsare.
      if (onboardingDoneFromMeta(meta, VERTICAL)) {
        setNeedsOnboarding(false);
        setIsLoaded(true);
        return;
      }
    }

    // Fallback: localStorage
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored) setSlug(stored);

      // Kolla om onboarding behövs
      const done = window.localStorage.getItem(LS_ONBOARDING_KEY);
      if (!done && !stored) {
        setNeedsOnboarding(true);
      }
    }
    setIsLoaded(true);
  }, [clerkLoaded, clerkTimedOut, user]);

  const setFavoriteTeam = useCallback(
    async (newSlug: string, teamId?: string) => {
      setSlug(newSlug);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_KEY, newSlug);
        window.localStorage.setItem(LS_ONBOARDING_KEY, "1");
      }
      setNeedsOnboarding(false);

      // Spara i Clerk metadata om inloggad
      if (user) {
        try {
          await user.update({
            // Per sport: ett hockeyval skriver aldrig över fotbollslaget (lib/favorite-meta).
            unsafeMetadata: withFavorite(user.unsafeMetadata as Record<string, unknown>, VERTICAL, newSlug),
          });
        } catch {
          // Clerk-fel är icke-kritiskt — localStorage räcker
        }
        if (teamId) await syncFollowedTeam(teamId);
        await recordTeamSelectedMilestone();
        // Spegla till profiles.favourite_team_id — enda källan den publika
        // profilsidan (och /api/profile/[id]) kan läsa utan Clerk-backend-anrop.
        try {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ favourite_team_id: newSlug }),
          });
        } catch {
          // Icke-kritiskt — Clerk-metadata är fortfarande sanning för egna vyer
        }
      }
    },
    [user],
  );

  const clearFavoriteTeam = useCallback(async () => {
    setSlug(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_KEY);
    }
    if (user) {
      try {
        await user.update({
          unsafeMetadata: withFavorite(user.unsafeMetadata as Record<string, unknown>, VERTICAL, null),
        });
      } catch {
        // ignore
      }
    }
  }, [user]);

  const markOnboardingDone = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_ONBOARDING_KEY, "1");
    }
    setNeedsOnboarding(false);
    // Persistera server-side så onboarding-gaten (mitt-lag/onboarding) ser
    // "klar utan lag" på alla enheter — localStorage är enhetsbunden.
    if (user) {
      void user
        .update({
          unsafeMetadata: withOnboardingDone(user.unsafeMetadata as Record<string, unknown>, VERTICAL),
        })
        .catch(() => {});
    }
  }, [user]);

  return { slug, isLoaded, setFavoriteTeam, clearFavoriteTeam, needsOnboarding, markOnboardingDone };
}

export const useFavoriteTeam = clerkEnabled ? useClerkFavoriteTeam : useLocalFavoriteTeam;
