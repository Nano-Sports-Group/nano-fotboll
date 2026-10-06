import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";

/**
 * Betalningstabellerna och RPC:erna (`billing_*`) finns inte i `types/supabase` — typerna genereras
 * först när migrationen är körd. Casten bor HÄR och ingen annanstans: byt den mot den typade
 * klienten när `pnpm supabase gen types` har körts, så följer alla anropare med.
 */
export function billingDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** RPC som kastar vid fel i stället för att returnera {error} — webhooken ska svara 5xx, inte tiga. */
export async function billingRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await billingDb().rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}
