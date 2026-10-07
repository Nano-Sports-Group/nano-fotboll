/**
 * lib/billing/web-handoff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Fortsätt på Nano Web" från en app. Rena beslut — rutten (`/api/billing/web-handoff`) och
 * landningssidan (`/handoff`) använder dem, och testerna täcker dem.
 *
 * POLICY: appbutikernas regler förbjuder att styra användaren till ett externt köp om inte ett
 * särskilt program tillåter det. Servern svarar därför bara med en adress när
 * `payment_routing_rules` ger flödet `external_web_checkout` för just den här plattformen,
 * landet, versionen och storefronten. Det finns ingen förbikoppling och ingen standard som tillåter.
 *
 * Målet efter inloggningen är en fast lista interna sökvägar — aldrig en adress ur begäran.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PurchaseOption } from "./routing";

export const HANDOFF_PLATFORMS = ["android", "ios"] as const;
export type HandoffPlatform = (typeof HANDOFF_PLATFORMS)[number];

/** Tillåtna mål. Nyckeln kommer ur begäran (`target`), värdet är en fast intern sökväg. */
export const HANDOFF_TARGETS = { upgrade: "/konto/uppgradera" } as const;
export type HandoffTarget = keyof typeof HANDOFF_TARGETS;

/** Flödet reglerna måste ge. Är det inte med är svaret 403. */
export const EXTERNAL_FLOW = "external_web_checkout";

export function isHandoffPlatform(v: unknown): v is HandoffPlatform {
  return v === "android" || v === "ios";
}

/** Tillåtet bara om reglerna uttryckligen innehåller det externa webbflödet. `not_available` och allt annat = nej. */
export function handoffAllowed(options: readonly PurchaseOption[]): boolean {
  return options.some((o) => o.flow === EXTERNAL_FLOW);
}

/** Den interna sökvägen (med `from`) användaren landar på efter inloggningen. Alltid ur listan ovan. */
export function handoffRedirectPath(target: HandoffTarget, platform: HandoffPlatform): string {
  return `${HANDOFF_TARGETS[target]}?from=${platform}`;
}

/**
 * Biljetten ligger i URL-fragmentet (`#`), som webbläsaren aldrig skickar till servern — den hamnar därför
 * inte i åtkomstloggar eller Referer. Sidan läser den, tömmer fragmentet och löser in den direkt.
 */
export function handoffUrl(siteUrl: string, ticket: string, platform: HandoffPlatform, target: HandoffTarget): string {
  const params = new URLSearchParams({ t: ticket, from: platform, to: target });
  return `${siteUrl.replace(/\/$/, "")}/handoff#${params.toString()}`;
}

/**
 * Läser fragmentet på /handoff. Okänt eller saknat mål/plattform → tillåtna standardvärden;
 * sökvägen byggs alltid av `handoffRedirectPath`, så ingen sträng ur adressen når en redirect.
 */
export function parseHandoffFragment(hash: string): { ticket: string | null; platform: HandoffPlatform; target: HandoffTarget } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const ticket = params.get("t");
  const from = params.get("from");
  const to = params.get("to");
  return {
    ticket: ticket && /^[A-Za-z0-9._-]{8,2048}$/.test(ticket) ? ticket : null,
    platform: isHandoffPlatform(from) ? from : "android",
    target: to && Object.prototype.hasOwnProperty.call(HANDOFF_TARGETS, to) ? (to as HandoffTarget) : "upgrade",
  };
}
