/**
 * /api/webhooks/resend — studsar och klagomål från Resend.
 *
 * En adress som studsat hårt eller anmält oss som skräppost får aldrig fler brev.
 * Signaturen (svix) verifieras alltid; utan RESEND_WEBHOOK_SECRET svarar routen 503 och gör ingenting.
 */

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { markNewsletterUndeliverable } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";

interface ResendEvent {
  type?: string;
  data?: { to?: string[] | string; bounce?: { type?: string } };
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(await req.text(), {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Tillfälliga studsar (full inkorg) ska inte stänga av någon — bara permanenta.
  const status =
    event.type === "email.complained" ? "complained"
    : event.type === "email.bounced" && event.data?.bounce?.type !== "Transient" ? "bounced"
    : null;
  if (!status) return NextResponse.json({ ok: true, ignored: true });

  const to = event.data?.to;
  const recipients = Array.isArray(to) ? to : to ? [to] : [];
  for (const email of recipients) await markNewsletterUndeliverable(email, status);
  return NextResponse.json({ ok: true });
}
