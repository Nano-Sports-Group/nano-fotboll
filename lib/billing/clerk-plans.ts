/**
 * lib/billing/clerk-plans.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Den rena delen av projektionen: rättigheter → `publicMetadata.plan` / `plans.hockey`.
 * (Clerk-anropet bor i project.ts; den här filen går att testa utan nätverk.)
 *
 * Fotboll läser `plan` (free|pro|elite), hockey läser `plans.hockey` — se lib/plan-for-vertical.
 * `plans.maps` och `plans.tv` ägs av Maps- och TV-apparnas webhookar och bevaras orörda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { EntitlementMap } from "./types";

export type ClerkPlan = "free" | "pro" | "elite";

export function normalizeClerkPlan(v: unknown): ClerkPlan {
  return v === "elite" ? "elite" : v === "pro" ? "pro" : "free";
}

export interface ClerkPlanProjection {
  plan: ClerkPlan;
  /** Hela `plans`-objektet med bevarade syskonnycklar — Clerk skriver över `plans` som en helhet. */
  plans: Record<string, unknown>;
  footballChanged: boolean;
  hockeyChanged: boolean;
  /** Falskt = metadatan stämmer redan; skriv inget. */
  changed: boolean;
}

export function entitlementsToClerkPlans(
  entitlements: Partial<EntitlementMap>,
  currentPublicMetadata: Record<string, unknown> | null | undefined,
): ClerkPlanProjection {
  const plan: ClerkPlan = entitlements.football_elite ? "elite" : entitlements.football_pro ? "pro" : "free";
  const hockey: ClerkPlan = entitlements.hockey_pro ? "pro" : "free";

  const currentPlans =
    currentPublicMetadata?.plans && typeof currentPublicMetadata.plans === "object"
      ? (currentPublicMetadata.plans as Record<string, unknown>)
      : {};

  const footballChanged = normalizeClerkPlan(currentPublicMetadata?.plan) !== plan;
  const hockeyChanged = normalizeClerkPlan(currentPlans.hockey) !== hockey;

  return {
    plan,
    plans: { ...currentPlans, hockey },
    footballChanged,
    hockeyChanged,
    changed: footballChanged || hockeyChanged,
  };
}
