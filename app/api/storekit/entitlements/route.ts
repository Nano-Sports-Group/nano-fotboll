import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchAuthoritativeTransaction } from "@/lib/app-store";
import { enforceRateLimit } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getOrCreateAccountToken } from "@/lib/billing/store-account";
import { syncStoreKitTransaction } from "@/lib/storekit-entitlements";
import { parseBody, z } from "@/lib/validation";
import { jsonContract } from "@/lib/api-contract";
import { StoreAccountTokenResponseSchema, StoreEntitlementSyncResponseSchema } from "@/lib/api-schemas";

const TransactionSchema = z.object({
  transactionId: z.string().regex(/^[0-9]{5,40}$/),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }

  try {
    const appAccountToken = await getOrCreateAccountToken(userId);
    return jsonContract(StoreAccountTokenResponseSchema, { appAccountToken });
  } catch (error) {
    console.error("[storekit GET]", error);
    return NextResponse.json({ error: "Kunde inte förbereda köp" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, TransactionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const [transaction, accountToken] = await Promise.all([
      fetchAuthoritativeTransaction(parsed.data.transactionId),
      getOrCreateAccountToken(userId),
    ]);
    if (transaction.appAccountToken?.toLowerCase() !== accountToken.toLowerCase()) {
      return NextResponse.json(
        { error: "Köpet tillhör inte detta konto", code: "account_mismatch" },
        { status: 403 },
      );
    }

    const synced = await syncStoreKitTransaction(transaction);
    if (synced.userId !== userId) throw new Error("Synced entitlement user mismatch");

    return jsonContract(StoreEntitlementSyncResponseSchema, {
      ok: true,
      plan: synced.effectivePlan,
      storekitPlan: synced.storekitPlan,
      expiresAt: synced.expiresAt,
    });
  } catch (error) {
    console.error("[storekit POST]", error);
    return NextResponse.json(
      { error: "Kunde inte verifiera App Store-köpet", code: "verification_failed" },
      { status: 502 },
    );
  }
}
