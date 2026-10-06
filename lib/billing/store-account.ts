import "server-only";

import { createServerClient } from "@/lib/supabase";

/**
 * Kontotoken som kopplar ett butikskö (Apple `appAccountToken`, Googles `obfuscatedExternalAccountId`)
 * till en inloggad användare. Samma tabell (`app_store_accounts`) för båda butikerna: en token per
 * användare, skapad av servern, aldrig av klienten.
 */
export async function getOrCreateAccountToken(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("app_store_accounts")
    .select("app_account_token")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (existing) return existing.app_account_token;

  const { data, error } = await supabase
    .from("app_store_accounts")
    .insert({ clerk_user_id: userId })
    .select("app_account_token")
    .single();
  if (!error && data) return data.app_account_token;

  const { data: raced, error: racedError } = await supabase
    .from("app_store_accounts")
    .select("app_account_token")
    .eq("clerk_user_id", userId)
    .single();
  if (racedError || !raced) throw racedError ?? new Error("Account token missing");
  return raced.app_account_token;
}

/** Omvänd uppslagning: vem äger token? null = okänd token (ignoreras av webhooken). */
export async function userIdForAccountToken(token: string): Promise<string | null> {
  // Kolumnen är uuid: ett annat värde (någon annans köp) är ett "okänt", inte ett databasfel.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;
  const { data, error } = await createServerClient()
    .from("app_store_accounts")
    .select("clerk_user_id")
    .eq("app_account_token", token.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data?.clerk_user_id ?? null;
}
