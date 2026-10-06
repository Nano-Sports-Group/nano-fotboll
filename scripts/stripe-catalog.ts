/**
 * scripts/stripe-catalog.ts — håller Stripes produktkatalog lika med lib/stripe-catalog.ts.
 *
 *   pnpm stripe:catalog            jämför och skriver ut skillnader (ändrar ingenting, exit 1 vid glapp)
 *   pnpm stripe:catalog --apply    skapar/uppdaterar produkter, priser, kundportal och webhook-händelser
 *
 * Läget (test/live) avgörs av nyckeln i STRIPE_SECRET_KEY. Går att köra om hur många gånger som helst.
 * Ett pris ändras aldrig på plats (Stripe tillåter det inte): ett nytt skapas, lookup-nyckeln flyttas
 * och det gamla arkiveras. Befintliga prenumeranter ligger kvar på sitt gamla pris.
 * Webhook-endpoints skapas aldrig här (då uppstår en ny hemlighet) — bara händelselistan rättas.
 */

import Stripe from "stripe";
import { CATALOG } from "../lib/stripe-catalog";

const APPLY = process.argv.includes("--apply");
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("STRIPE_SECRET_KEY saknas");
  process.exit(2);
}
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });

/** Vad varje hanterare faktiskt läser. Övriga händelser är brus i Stripes leveranslogg. */
const WEBHOOK_EVENTS: Record<string, Stripe.WebhookEndpointUpdateParams.EnabledEvent[]> = {
  "/webhooks/stripe/sport": [
    "checkout.session.completed",
    "checkout.session.expired",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    // Betalningskärnan (docs/billing): försäljning, misslyckad betalning, återbetalning, tvist.
    "invoice.paid",
    "invoice.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
  ],
  "/webhooks/stripe/maps": ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"],
  "/webhooks/stripe/tv": ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"],
};

let gaps = 0;
const say = (state: "ok" | "glapp" | "gjort", text: string) => {
  if (state === "glapp") gaps++;
  console.log(`${state === "ok" ? "  ok   " : state === "gjort" ? "  GJORT" : "  GLAPP"} ${text}`);
};

async function main() {
  const account = await stripe.accounts.retrieveCurrent();
  console.log(`Konto ${account.id} (${account.business_profile?.name ?? "?"}), ${key!.startsWith("sk_live") ? "LIVE" : "testläge"}${APPLY ? ", --apply" : ", bara jämförelse"}\n`);

  for (const product of CATALOG) {
    const want = { name: product.name, description: product.description, metadata: product.metadata };
    let existing: Stripe.Product | null = null;
    try {
      existing = await stripe.products.retrieve(product.id);
    } catch {
      existing = null;
    }
    if (!existing) {
      if (APPLY) await stripe.products.create({ id: product.id, ...want });
      say(APPLY ? "gjort" : "glapp", `produkt ${product.id} saknas${APPLY ? " — skapad" : ""}`);
    } else if (
      existing.name !== want.name ||
      existing.description !== want.description ||
      !existing.active ||
      Object.entries(want.metadata).some(([k, v]) => existing!.metadata[k] !== v)
    ) {
      if (APPLY) await stripe.products.update(product.id, { ...want, active: true });
      say(APPLY ? "gjort" : "glapp", `produkt ${product.id} skiljer sig${APPLY ? " — uppdaterad" : ""}`);
    } else {
      say("ok", `produkt ${product.id}`);
    }

    for (const price of product.prices) {
      const found = (await stripe.prices.list({ lookup_keys: [price.lookupKey], limit: 1 })).data[0];
      const same =
        found?.active &&
        found.unit_amount === price.amount &&
        found.currency === "sek" &&
        found.recurring?.interval === price.interval &&
        found.product === product.id;
      if (same) {
        say("ok", `  pris ${price.lookupKey} ${price.amount / 100} kr/${price.interval}`);
        continue;
      }
      if (APPLY) {
        await stripe.prices.create({
          product: product.id,
          currency: "sek",
          unit_amount: price.amount,
          recurring: { interval: price.interval },
          lookup_key: price.lookupKey,
          transfer_lookup_key: true,
          nickname: price.nickname,
          // Svenska konsumentpriser visas alltid inklusive moms.
          tax_behavior: "inclusive",
        });
        if (found?.active) await stripe.prices.update(found.id, { active: false });
      }
      say(APPLY ? "gjort" : "glapp", `  pris ${price.lookupKey} ${price.amount / 100} kr/${price.interval} ${found ? `(Stripe har ${(found.unit_amount ?? 0) / 100})` : "saknas"}${APPLY ? " — skapat" : ""}`);
    }
  }

  // Kundportal: kortbyte, fakturor och uppsägning vid periodens slut. Planbyte är AV — planen bor i
  // prenumerationens metadata, och ett prisbyte i portalen skulle ge fel behörighet. Byten görs under Konto.
  const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 10 });
  if (portals.data.length === 0) {
    if (APPLY) {
      await stripe.billingPortal.configurations.create({
        business_profile: { headline: "Nano Sport — hantera din prenumeration" },
        default_return_url: "https://fotboll.nanosport.se/konto",
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          customer_update: { enabled: true, allowed_updates: ["email", "address"] },
          subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "unused", "switched_service", "other"] } },
          subscription_update: { enabled: false },
        },
        metadata: { nano: "default" },
      });
    }
    say(APPLY ? "gjort" : "glapp", `kundportal saknar konfiguration${APPLY ? " — skapad" : ""}`);
  } else {
    const c = portals.data.find((p) => p.is_default) ?? portals.data[0]!;
    if (c.features.subscription_update.enabled) say("glapp", "kundportalen tillåter planbyte — ska vara av (planen bor i metadata)");
    else say("ok", `kundportal ${c.is_default ? "(standard)" : "(skapad av skriptet)"}`);
  }

  const endpoints = await stripe.webhookEndpoints.list({ limit: 30 });
  for (const [path, events] of Object.entries(WEBHOOK_EVENTS)) {
    const endpoint = endpoints.data.find((e) => e.url.endsWith(path) && e.status === "enabled");
    if (!endpoint) {
      console.log(`  –     webhook ${path} finns inte i det här läget`);
      continue;
    }
    const same = endpoint.enabled_events.length === events.length && events.every((e) => endpoint.enabled_events.includes(e));
    if (same) say("ok", `webhook ${path} (${events.length} händelser)`);
    else {
      if (APPLY) await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: events });
      say(APPLY ? "gjort" : "glapp", `webhook ${path}: ${endpoint.enabled_events.length} händelser → ${events.length}${APPLY ? " — rättat" : ""}`);
    }
  }
  for (const stale of endpoints.data.filter((e) => !Object.keys(WEBHOOK_EVENTS).some((p) => e.url.endsWith(p)))) {
    console.log(`  !     okänd webhook ${stale.url} (${stale.status}) — ta bort i Stripe om den är gammal`);
  }

  console.log(`\n${gaps === 0 ? "Katalogen stämmer med koden." : `${gaps} glapp — kör med --apply.`}`);
  process.exit(gaps === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
