/**
 * lib/newsletter/email.ts — bekräftelsemejlet för Lagbriefen (dubbel bekräftelse).
 *
 * Beehiiv skötte det här tidigare. Sedan 2026-10-05 går all e-post via Resend, så webben skickar
 * bekräftelsen själv — samma transport och samma ton som väntelistans mejl (lib/waitlist/email.ts).
 * Själva brevet skickas av motorn (nano-os), aldrig härifrån.
 *
 * Saknas RESEND_API_KEY eller den delade hemligheten skickas ingenting och anroparen får veta det.
 */

import "server-only";
import { SPORT_ACCENT } from "@/lib/vertical";
import { CONTACT_EMAIL, getSiteHost, getSiteUrl } from "@/lib/site-url";
import { newsletterToken, newsletterTokenSecret } from "@/lib/newsletter/token";

const FROM = process.env.NEWSLETTER_EMAIL_FROM ?? process.env.WAITLIST_EMAIL_FROM ?? `Nano Fotboll <${CONTACT_EMAIL}>`;

export type NewsletterSendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error" };

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function newsletterConfirmUrl(subscriberId: string, secret: string): string {
  return `${getSiteUrl()}/brev/bekrafta?token=${encodeURIComponent(newsletterToken(secret, "confirm", subscriberId))}`;
}

export function newsletterConfirmContent(href: string, teamName: string): { subject: string; html: string; text: string } {
  const team = esc(teamName);
  return {
    subject: `Bekräfta Lagbriefen om ${teamName}`,
    html: `<!doctype html><html lang="sv"><body style="margin:0;padding:24px;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#151516;line-height:1.6">
<div style="max-width:520px;margin:0 auto">
<p style="font-size:18px;font-weight:600;margin:0 0 24px">Nano Fotboll</p>
<p>Du har bett om Lagbriefen om ${team}. Bekräfta din e-post så börjar den komma.</p>
<p style="margin:24px 0"><a href="${esc(href)}" style="background:${SPORT_ACCENT.base};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Bekräfta prenumerationen</a></p>
<p style="font-size:13px;color:#6b6b6b">Fungerar inte knappen? Klistra in den här länken i webbläsaren:<br><span style="word-break:break-all">${esc(href)}</span></p>
<p style="margin-top:32px;font-size:12px;color:#6b6b6b">Du får det här mejlet för att någon skrev in din adress på ${getSiteHost()}. Var det inte du kan du ignorera det — då skickas inget mer.</p>
</div></body></html>`,
    text: `Du har bett om Lagbriefen om ${teamName}. Bekräfta din e-post så börjar den komma:\n\n${href}\n\nVar det inte du kan du ignorera det här mejlet — då skickas inget mer.`,
  };
}

/** Kastar aldrig: en mejlleverantör som är nere får inte fälla anmälan. Raden ligger kvar som obekräftad. */
export async function sendNewsletterConfirmEmail(to: string, subscriberId: string, teamName: string): Promise<NewsletterSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const secret = newsletterTokenSecret();
  if (!apiKey || !secret) return { sent: false, reason: "not_configured" };

  const { subject, html, text } = newsletterConfirmContent(newsletterConfirmUrl(subscriberId, secret), teamName);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      console.error("[newsletter] Resend svarade", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[newsletter] kunde inte nå Resend:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "provider_error" };
  }
}
