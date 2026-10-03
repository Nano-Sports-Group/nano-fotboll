"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import {
  EMPTY_FOLLOWS,
  followCount,
  followsFromMeta,
  mergeFollows,
  parseFollows,
  toggleFollow,
  withFollows,
  type FollowKind,
  type GolfFollows,
} from "@/lib/golf/follows";

const LS_KEY = "nano_golf_follows";
const CHANGED = "nano-golf-follows";

// Senast lästa värde, så att useSyncExternalStore får samma objekt så länge lagringen är oförändrad.
let cached: { raw: string | null; value: GolfFollows } = { raw: null, value: EMPTY_FOLLOWS };

function readLocal(): GolfFollows {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LS_KEY);
  } catch {
    return cached.value; // privat läge: det som ligger i minnet
  }
  if (raw === cached.raw) return cached.value;
  let value = EMPTY_FOLLOWS;
  try {
    value = parseFollows(JSON.parse(raw ?? "null"));
  } catch {
    // Trasigt värde: börja om.
  }
  cached = { raw, value };
  return value;
}

function writeLocal(follows: GolfFollows): void {
  const raw = JSON.stringify(follows);
  cached = { raw, value: follows };
  try {
    window.localStorage.setItem(LS_KEY, raw);
  } catch {
    // Privat läge: valet lever bara i minnet.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const never = () => () => {};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_[A-Za-z0-9+/=]+$/);

export interface GolfFollowsState {
  follows: GolfFollows;
  /** false tills valet är läst — rendera inget som beror på det innan dess. */
  isLoaded: boolean;
  toggle: (kind: FollowKind, slug: string) => void;
}

/**
 * Gäst: valet ligger i localStorage. Alla knappar på sidan hålls i takt via en händelse.
 * Hydreringssäkert: servern och första renderingen ser en tom lista och isLoaded = false.
 */
function useLocalGolfFollows(): GolfFollowsState {
  const follows = useSyncExternalStore(subscribe, readLocal, () => EMPTY_FOLLOWS);
  const isLoaded = useSyncExternalStore(never, () => true, () => false);
  const toggle = useCallback((kind: FollowKind, slug: string) => writeLocal(toggleFollow(readLocal(), kind, slug)), []);
  return { follows, isLoaded, toggle };
}

/**
 * Inloggad: Clerk `unsafeMetadata.golfFollows`, så valet följer med mellan enheter.
 * Optimistiskt: knappen svarar direkt och backar om Clerk nekar. Gästens val förs över en gång.
 */
function useClerkGolfFollows(): GolfFollowsState {
  const { user, isLoaded: clerkLoaded } = useUser();
  const local = useLocalGolfFollows();
  const [optimistic, setOptimistic] = useState<GolfFollows | null>(null);

  const saved = user ? followsFromMeta(user.unsafeMetadata as Record<string, unknown>) : null;

  useEffect(() => {
    if (!user || !local.isLoaded || followCount(local.follows) === 0) return;
    const merged = mergeFollows(followsFromMeta(user.unsafeMetadata as Record<string, unknown>), local.follows);
    void user
      .update({ unsafeMetadata: withFollows(user.unsafeMetadata as Record<string, unknown>, merged) })
      .then(() => writeLocal(EMPTY_FOLLOWS))
      .catch(() => {});
  }, [user, local.isLoaded, local.follows]);

  const toggle = useCallback(
    (kind: FollowKind, slug: string) => {
      if (!user) return local.toggle(kind, slug);
      const next = toggleFollow(optimistic ?? followsFromMeta(user.unsafeMetadata as Record<string, unknown>), kind, slug);
      setOptimistic(next);
      void user
        .update({ unsafeMetadata: withFollows(user.unsafeMetadata as Record<string, unknown>, next) })
        .catch(() => undefined)
        .finally(() => setOptimistic(null)); // lyckat: Clerk bär värdet. misslyckat: tillbaka till det sparade.
    },
    [user, optimistic, local],
  );

  if (!user) return { follows: local.follows, isLoaded: clerkLoaded && local.isLoaded, toggle };
  return { follows: optimistic ?? saved ?? EMPTY_FOLLOWS, isLoaded: true, toggle };
}

export const useGolfFollows = clerkEnabled ? useClerkGolfFollows : useLocalGolfFollows;
