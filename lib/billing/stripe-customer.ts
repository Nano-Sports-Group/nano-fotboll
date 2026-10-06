import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { billingDb } from "./db";
import type { BillingEnvironment } from "./types";

/** Stripe-nyckelns läge avgör vilken miljö kundraden hör till — test- och skarpa kunder blandas aldrig. */
export function stripeEnvironment(): BillingEnvironment {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "") ? "live" : "test";
}

async function existsInStripe(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !("deleted" in customer && customer.deleted);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return false;
    throw error;
  }
}

/**
 * EN Stripe-kund per användare och miljö. Tidigare gav varje köp en ny kund (ingen `customer`
 * i kassan), vilket splittrade fakturor, kundportalen och återbetalningar.
 *
 * Ordning: `billing_customers` → Clerks `privateMetadata.stripeCustomerId` (Clerk-webhooken skapar
 * en kund vid registrering) → ny kund med idempotensnyckel. Kunden verifieras mot Stripe varje gång
 * — en raderad kund i dashboarden ska inte ge en trasig kassa.
 */
export async function getOrCreateStripeCustomer(stripe: Stripe, clerkUserId: string, email: string | null): Promise<string> {
  const db = billingDb();
  const environment = stripeEnvironment();

  const readMapped = async (): Promise<string | null> => {
    const { data: user } = await db.from("billing_users").select("id").eq("clerk_user_id", clerkUserId).maybeSingle();
    if (!user) return null;
    const { data } = await db
      .from("billing_customers")
      .select("provider_customer_id")
      .eq("user_id", (user as { id: string }).id)
      .eq("provider", "stripe")
      .eq("environment", environment)
      .maybeSingle();
    return (data as { provider_customer_id: string } | null)?.provider_customer_id ?? null;
  };

  const mapped = await readMapped();
  if (mapped && (await existsInStripe(stripe, mapped))) return mapped;

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const fromClerk = clerkUser.privateMetadata?.stripeCustomerId;
  let customerId: string | null =
    typeof fromClerk === "string" && fromClerk && (await existsInStripe(stripe, fromClerk)) ? fromClerk : null;

  if (!customerId) {
    const created = await stripe.customers.create(
      { ...(email ? { email } : {}), metadata: { clerkUserId } },
      { idempotencyKey: `customer:${clerkUserId}` },
    );
    customerId = created.id;
  }

  // Spara kopplingen. Vid kapplöpning (två kassor samtidigt) vinner den som skrev först — läs om.
  const { data: user, error: userError } = await db
    .from("billing_users")
    .upsert({ clerk_user_id: clerkUserId, ...(email ? { email } : {}) }, { onConflict: "clerk_user_id" })
    .select("id")
    .single();
  if (userError || !user) throw new Error(`billing_users: ${userError?.message ?? "ingen rad"}`);

  const { error: linkError } = await db.from("billing_customers").insert({
    user_id: (user as { id: string }).id,
    provider: "stripe",
    provider_customer_id: customerId,
    environment,
  });
  if (linkError) {
    const winner = await readMapped();
    if (!winner) throw new Error(`billing_customers: ${linkError.message}`);
    customerId = winner;
  }

  if (clerkUser.privateMetadata?.stripeCustomerId !== customerId) {
    await clerk.users.updateUserMetadata(clerkUserId, { privateMetadata: { stripeCustomerId: customerId } });
  }
  return customerId;
}
