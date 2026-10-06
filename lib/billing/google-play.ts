import "server-only";

import { createSign } from "node:crypto";
import type { GoogleOrder, GoogleSubscriptionPurchase } from "./google-normalize";

/**
 * Android Publisher API med tjänstekonto — utan beroende: en RS256-JWT byggd med node:crypto
 * byts mot en access token hos Google. Hemligheterna ligger bara i env och loggas aldrig.
 *
 * Env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (hela nyckelfilen), GOOGLE_PLAY_PACKAGE_NAME,
 *      GOOGLE_PLAY_RTDN_TOKEN (hemlig token i Pub/Sub-push-adressen, används av webhooken).
 * Saknas de svarar rutterna 503 — en tom Google-konfiguration får aldrig fälla en deploy.
 */

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const TIMEOUT_MS = 15_000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function isGooglePlayConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_PLAY_PACKAGE_NAME);
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON saknas");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON är ofullständig");
  // Env-system gör ofta "\n" till bokstavlig backslash-n.
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  // 60 s marginal så en token aldrig går ut mitt i ett anrop.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const account = serviceAccount();
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google OAuth: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google OAuth: ingen access_token");
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function get<T>(path: string): Promise<T> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) throw new Error("GOOGLE_PLAY_PACKAGE_NAME saknas");
  const res = await fetch(`${API}/${encodeURIComponent(packageName)}/${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google Play API ${path.split("/")[0]}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Köpet hos Google, alltid färskt — vi litar aldrig på innehållet i en RTDN-notis. */
export function fetchSubscriptionPurchase(purchaseToken: string): Promise<GoogleSubscriptionPurchase> {
  return get<GoogleSubscriptionPurchase>(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
}

/** Order med belopp och moms. Tolerant: ett fel här ger bara en prenumeration utan transaktion (loggas). */
export async function fetchOrder(orderId: string): Promise<GoogleOrder | null> {
  try {
    return await get<GoogleOrder>(`orders/${encodeURIComponent(orderId)}`);
  } catch (error) {
    console.warn("[google-play] orders.get misslyckades:", error instanceof Error ? error.message : "okänt fel");
    return null;
  }
}
