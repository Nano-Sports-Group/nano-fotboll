/**
 * /api/cron/billing-sweep — var tionde minut (vercel.json).
 *
 * 1. `billing_sweep()` låter utgångna prenumerationer löpa ut och returnerar användare vars
 *    rättigheter ändrats.
 * 2. Alla `billing_users` med `projection_dirty_at` projiceras till Clerk (max 200 per körning;
 *    resten tas nästa gång). Samma rutt anropas efter en manuell ändring i admin.
 *
 * Auth: CRON_SECRET. Vercel Cron skickar `Authorization: Bearer <CRON_SECRET>`; x-cron-secret
 * (som övriga interna rutter) accepteras också. Admin kan anropa med POST.
 */

import { NextResponse } from "next/server";
import { secretsEqual } from "@/lib/secrets";
import { billingDb, billingRpc } from "@/lib/billing/db";
import { getEntitlements } from "@/lib/billing/entitlements";
import { projectEntitlementsToClerk } from "@/lib/billing/project";

const MAX_PROJECTIONS = 200;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return secretsEqual(bearer, secret) || secretsEqual(req.headers.get("x-cron-secret"), secret);
}

async function sweep(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const swept = (await billingRpc<string[] | null>("billing_sweep", {})) ?? [];

    const { data, error } = await billingDb()
      .from("billing_users")
      .select("clerk_user_id")
      .not("projection_dirty_at", "is", null)
      .order("projection_dirty_at", { ascending: true })
      .limit(MAX_PROJECTIONS);
    if (error) throw new Error(`billing_users: ${error.message}`);

    let projected = 0;
    let failed = 0;
    for (const row of (data ?? []) as { clerk_user_id: string }[]) {
      try {
        await projectEntitlementsToClerk(row.clerk_user_id, await getEntitlements(row.clerk_user_id));
        projected++;
      } catch (err) {
        // En användare som fallerar får inte stoppa de andra; hen ligger kvar som dirty till nästa körning.
        failed++;
        console.error(`[billing-sweep] projektion misslyckades för ${row.clerk_user_id}:`, err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ swept: swept.length, projected, failed, capped: (data?.length ?? 0) === MAX_PROJECTIONS });
  } catch (error) {
    console.error("[billing-sweep]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Svepet misslyckades" }, { status: 500 });
  }
}

export const GET = sweep;
export const POST = sweep;
