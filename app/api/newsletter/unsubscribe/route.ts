/**
 * /api/newsletter/unsubscribe — mejlklientens ettklicksavslut (RFC 8058, List-Unsubscribe-Post).
 *
 * POST avslutar direkt: det är mejlklienten som skickar den, på läsarens uttryckliga klick.
 * GET gör ingenting utom att visa sidan med knappen — länkskannrar hämtar med GET.
 * Token är signerad med den delade hemligheten; ingen identitet läses ur bodyn.
 */

import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeNewsletterByToken } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const outcome = await unsubscribeNewsletterByToken(req.nextUrl.searchParams.get("token") ?? "");
  if (outcome === "invalid") return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export function GET(req: NextRequest) {
  const url = new URL("/brev/avsluta", req.nextUrl.origin);
  url.searchParams.set("token", req.nextUrl.searchParams.get("token") ?? "");
  return NextResponse.redirect(url);
}
