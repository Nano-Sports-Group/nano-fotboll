import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signerade länkar i Lagbriefens mejl: bekräfta prenumerationen, avsluta den.
 *
 * Token = `<subscriber-id>.<hmac>`. Ingen kolumn, ingen tabell: signaturen räknas om med den
 * hemlighet webben och motorn redan delar (ATHOPIA_OS_HTTP_SECRET).
 *
 * SAMMA KOD finns i nano-os/packages/notifications/src/resend/token.ts — motorn skapar
 * avslutningslänkarna, webben verifierar dem. Testvektorn i token.test.ts är gemensam.
 */
export type NewsletterTokenPurpose = "confirm" | "unsubscribe";

function sign(secret: string, purpose: NewsletterTokenPurpose, subscriberId: string): string {
  return createHmac("sha256", secret).update(`newsletter:${purpose}:${subscriberId}`).digest("base64url");
}

export function newsletterToken(secret: string, purpose: NewsletterTokenPurpose, subscriberId: string): string {
  if (!secret) throw new Error("newsletter token secret is missing");
  return `${subscriberId}.${sign(secret, purpose, subscriberId)}`;
}

/** Prenumerantens id om token stämmer för syftet, annars null. Ett bekräfta-token avslutar ingenting. */
export function verifyNewsletterToken(secret: string, purpose: NewsletterTokenPurpose, token: string): string | null {
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const subscriberId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(secret, purpose, subscriberId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? subscriberId : null;
}

export function newsletterTokenSecret(): string {
  return process.env.ATHOPIA_OS_HTTP_SECRET?.trim() ?? "";
}
