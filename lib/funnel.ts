import { createServiceClient } from "@/lib/supabase";

/**
 * Funnel-events för aktivering→PRO-konvertering (PRD: aktivering-pro-konvertering).
 * Klient-sidan skickar via /api/analytics/event; server-sidan via logFunnelEvent().
 */
export const FUNNEL_EVENTS = [
  "landing_view",
  "signup_complete",
  "onboarding_team_selected",
  "onboarding_complete",
  "feed_first_view",
  "home_module_impression",
  "home_module_opened",
  "paywall_view",
  "paywall_cta_click",
  "checkout_start",
  "checkout_success",
  "upgrade_elite",
  "push_opt_in",
  "newsletter_landing_view",
  "newsletter_signup_started",
  "newsletter_signup_pending",
  "newsletter_confirmed",
  "newsletter_click_to_product",
  "newsletter_to_account",
  "newsletter_preference_changed",
  "newsletter_to_pro",
  "waitlist_submit",
  "waitlist_confirmed",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * Produktevents som ytorna skickar via `<ProductEventTracker>` / `<TrackedLink>`.
 *
 * Måste stå här, inte bara i komponenten: `/api/analytics/event` avvisar allt
 * som saknas i allowlistan med 400, och klienten sväljer svaret. De sex nedan
 * skickades utan att någonsin loggas — telemetrin för lag-IA:n, nyhetsscopet
 * och analysytan var tyst tom medan konsolen larmade vid varje sidladdning.
 * Lägger du till ett nytt `event="..."` i en komponent: lägg till det här i
 * samma commit. `tests/e2e/analytics-allowlist.spec.ts` failar annars.
 */
export const PRODUCT_EVENTS = [
  "allsvenskan_news_opened",
  "news_filter_removed",
  "news_scope_changed",
  "team_analysis_opened",
  "team_hub_opened",
  "team_hub_tab_selected",
] as const;

/** Server-side logging — samma agent_logs-väg som /api/analytics/event. Får aldrig kasta. */
export async function logFunnelEvent(
  event: FunnelEvent,
  clerkUserId: string | null,
  props?: Record<string, string | number | boolean | null>
): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("agent_logs").insert({
      agent_name: "web-funnel",
      action: event,
      level: "info",
      message: event,
      kind: "product_event",
      payload: { ...(props ?? {}), clerk_user_id: clerkUserId ?? "anon" },
    });
  } catch {
    // Analytics får aldrig blockera flödet
  }
}
