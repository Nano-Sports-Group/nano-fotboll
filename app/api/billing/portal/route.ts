import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { enforceRateLimit } from "@/lib/ratelimit";
import { absoluteUrl } from "@/lib/site-url";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const blocked = await enforceRateLimit("checkout", req, userId);
  if (blocked) return blocked;

  const user = await currentUser();
  const customerId = user?.privateMetadata?.stripeCustomerId as string | undefined;
  if (!customerId) return NextResponse.json({ error: "Ingen Stripe-kund hittad" }, { status: 400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
  try {
    // Utan sparad standardkonfiguration i dashboarden vägrar Stripe skapa sessionen i live-läge.
    // `pnpm stripe:catalog --apply` skapar en; den pekas ut här när ingen standard finns.
    const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 10 });
    const configuration = configs.data.some((c) => c.is_default) ? undefined : configs.data[0]?.id;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      ...(configuration ? { configuration } : {}),
      return_url: absoluteUrl("/konto"),
      locale: "sv",
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
