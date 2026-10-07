/**
 * /api/billing/upgrade — uppgradera PRO → Elite på befintlig prenumeration.
 *
 * GET  → förhandsvisning ur Stripes förhandsfaktura (`invoices.createPreview`) med samma parametrar som POST.
 * POST → genomför: aktiv prenumeration får det outnyttjade krediterat och en ny period till Elite-priset
 *        börjar direkt; under provperiod byts bara priset (ingen debitering nu).
 *
 * Säkerhet: identitet ur sessionen, prenumerationen hämtas om från Stripe och måste ha metadata.clerkUserId
 * === inloggad användare, och inget belopp läses ur begäran. Rutten bokför ingenting — `invoice.paid`-webhooken
 * gör det; här synkas bara prenumerationens läge så att rättigheterna är rätt innan svaret.
 */

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { logFunnelEvent } from "@/lib/funnel";
import { syncSubscription } from "@/lib/billing/stripe-sync";
import { CARD_DECLINED_MESSAGE, buildUpdateParams, isCardDeclined, upgradeIdempotencyKey } from "@/lib/billing/upgrade";
import { ensureProduct, loadUpgradeSubject, previewUpgrade, resolveTargetPrice } from "@/lib/billing/upgrade-stripe";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Logga in först" }, { status: 401 });
  // Varje anrop ger ett Stripe-anrop, så samma tak som skrivande rutter.
  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
    const clerk = await clerkClient();
    const subject = await loadUpgradeSubject(stripe, clerk, userId);
    if (!subject.eligible) {
      return NextResponse.json(
        { eligible: false, reason: subject.reason, code: subject.code, currentPlan: subject.currentPlan, targetPlan: "elite" },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json(await previewUpgrade(stripe, subject), { headers: NO_STORE });
  } catch (err) {
    console.error("[billing/upgrade GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunde inte räkna ut uppgraderingen just nu. Försök igen om en stund." }, { status: 502, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Logga in först" }, { status: 401 });
  const blocked = await enforceRateLimit("checkout", req, userId);
  if (blocked) return blocked;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
  const clerk = await clerkClient();

  let subject;
  try {
    subject = await loadUpgradeSubject(stripe, clerk, userId);
  } catch (err) {
    console.error("[billing/upgrade POST] uppslag:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunde inte läsa din prenumeration. Försök igen om en stund." }, { status: 502 });
  }
  // Redan Elite (också efter ett dubbelklick som hann före) → 409; hockey/uppsägning/förfallen betalning → se `reason`.
  if (!subject.eligible) return NextResponse.json({ error: subject.reason, code: subject.code }, { status: subject.httpStatus });

  const { sub, item, mode, target } = subject;
  const periodStart = item.current_period_start ?? sub.start_date;

  try {
    const price = await resolveTargetPrice(stripe, target, (id, name) => ensureProduct(stripe, id, name));
    await stripe.subscriptions.update(sub.id, buildUpdateParams(mode, item.id, price, sub.metadata ?? {}), {
      idempotencyKey: upgradeIdempotencyKey(userId, sub.id, periodStart, Date.now()),
    });
  } catch (err) {
    if (isCardDeclined(err)) return NextResponse.json({ error: CARD_DECLINED_MESSAGE, code: "card_declined" }, { status: 402 });
    console.error("[billing/upgrade POST] Stripe:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Uppgraderingen gick inte igenom och din prenumeration är oförändrad. Försök igen om en stund." }, { status: 500 });
  }

  // Webhooken (customer.subscription.updated) gör samma sak, men rättigheterna ska vara rätta innan svaret.
  // Pengarna bokförs av invoice.paid — inte här.
  try {
    await syncSubscription(stripe, clerk, sub.id, {
      id: `upgrade:${sub.id}:${Date.now()}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      livemode: sub.livemode,
    });
  } catch (err) {
    console.error("[billing/upgrade] direktsynk misslyckades, webhooken tar över:", err instanceof Error ? err.message : err);
  }

  await logFunnelEvent("upgrade_elite", userId, { interval: target.interval, scope: target.scope, trialing: mode === "trialing" });
  return NextResponse.json({ ok: true, plan: "elite" });
}
