/**
 * POST /api/billing/web-handoff — "Fortsätt på Nano Web" från en app.
 *
 * Appen skickar sin Clerk-sessions-JWT som `Authorization: Bearer` (samma väg som /api/storekit/entitlements:
 * `auth()` tar emot bärartoken). Svaret är en kortlivad adress som loggar in samma användare i webbläsaren
 * och landar på /konto/uppgradera.
 *
 * POLICY: en adress lämnas BARA ut när `payment_routing_rules` ger flödet `external_web_checkout` för
 * plattformen, landet, appversionen och storefronten (appbutikernas regler kräver ett uttryckligt program).
 * Annars 403 `not_permitted`. Det finns ingen förbikoppling. Kan reglerna inte läsas: 503 (fail-closed).
 *
 * Biljetten (Clerk sign-in token, 120 s, engångs) loggas aldrig och står inte i granskningsraden.
 */

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { parseBody, z } from "@/lib/validation";
import { getSiteUrl } from "@/lib/site-url";
import { resolvePurchaseOptions } from "@/lib/billing/routing";
import { loadRoutingRules } from "@/lib/billing/routing-rules";
import { auditNote } from "@/lib/billing/apply";
import { HANDOFF_TARGETS, handoffAllowed, handoffUrl } from "@/lib/billing/web-handoff";

const BodySchema = z.object({
  platform: z.enum(["android", "ios"]),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  appVersion: z.string().regex(/^\d+(\.\d+){0,3}$/).optional(),
  storefront: z.string().regex(/^[A-Za-z]{2,3}$/).optional(),
  target: z.enum(Object.keys(HANDOFF_TARGETS) as [keyof typeof HANDOFF_TARGETS]).optional(),
});

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Logga in först" }, { status: 401, headers: NO_STORE });
  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { platform, country, appVersion, storefront, target } = parsed.data;

  let options;
  try {
    options = resolvePurchaseOptions(await loadRoutingRules(), { platform, country, appVersion, storefront });
  } catch (err) {
    console.error("[web-handoff] regler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunde inte avgöra vad som är tillåtet just nu" }, { status: 503, headers: NO_STORE });
  }
  if (!handoffAllowed(options)) {
    return NextResponse.json(
      { error: "Det här är inte tillgängligt i din app.", code: "not_permitted" },
      { status: 403, headers: NO_STORE },
    );
  }

  try {
    const clerk = await clerkClient();
    const token = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 120 });
    await auditNote(`user:${userId}`, "billing.web_handoff", userId, { platform, country: country?.toUpperCase() ?? null });
    return NextResponse.json({ url: handoffUrl(getSiteUrl(), token.token, platform, target ?? "upgrade") }, { headers: NO_STORE });
  } catch (err) {
    // Aldrig token eller hela felobjektet i loggen.
    console.error("[web-handoff] biljett:", err instanceof Error ? err.message : "okänt fel");
    return NextResponse.json({ error: "Kunde inte öppna webben just nu. Försök igen om en stund." }, { status: 502, headers: NO_STORE });
  }
}
