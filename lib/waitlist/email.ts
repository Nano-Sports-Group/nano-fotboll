/**
 * lib/waitlist/email.ts — bekräftelsemejl för waitlist.
 *
 * Web skickade ingen e-post alls före det här bygget: inget Resend, ingen
 * nodemailer, ingen SMTP. Beehiiv är Lagbrief och hör inte hit.
 *
 * Transport är därför Resends REST-API via `fetch` — inget nytt beroende, i
 * enlighet med "inga nya beroenden om befintliga räcker". Saknas
 * `RESEND_API_KEY` skickas ingenting och anroparen får veta det: raden ligger
 * kvar som `pending_confirm` med giltig token, så mejlet kan skickas om när
 * nyckeln finns. Vi låtsas aldrig att ett mejl gick iväg.
 *
 * Röst: `context/brand_voice.md` — svenska, lugn, inga emojis, inga utrop,
 * ingen AI-rad.
 */

import { SPORT_ACCENT } from "@/lib/vertical";
import "server-only";
import { CONTACT_EMAIL, getSiteHost, getSiteUrl } from "@/lib/site-url";

const FROM = process.env.WAITLIST_EMAIL_FROM ?? `Nano <${CONTACT_EMAIL}>`;

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error"; detail?: string };

function confirmUrl(token: string): string {
  return `${getSiteUrl()}/vaenta/bekrafta?token=${encodeURIComponent(token)}`;
}

/** Minimal, läsbar HTML. Ingen bildladdning, inga spårpixlar. */
function wrap(bodyHtml: string): string {
  return `<!doctype html><html lang="sv"><body style="margin:0;padding:24px;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#151516;line-height:1.6">
<div style="max-width:520px;margin:0 auto">
<p style="font-size:18px;font-weight:600;margin:0 0 24px">Nano Fotboll</p>
${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#6b6b6b">Du får det här mejlet för att du skrev upp dig på ${getSiteHost()}. Om det inte var du kan du ignorera det.</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:${SPORT_ACCENT.base};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${label}</a></p>
<p style="font-size:13px;color:#6b6b6b">Fungerar inte knappen? Klistra in den här länken i webbläsaren:<br><span style="word-break:break-all">${href}</span></p>`;
}

export function confirmEmailContent(token: string): {
  subject: string;
  html: string;
} {
  const href = confirmUrl(token);
  // Kohorten delas ut vid klick, inte vid submit. Mejlet lovar därför inte
  // Founder — confirm-sidan säger sanningen.
  return {
    subject: "Bekräfta din plats",
    html: wrap(
      `<p>Bekräfta din e-post så håller vi din plats i kön.</p>
<p>Klicka inom 48 timmar.</p>
${button(href, "Bekräfta min plats")}`,
    ),
  };
}

/**
 * Skickar via Resend REST. Kastar aldrig — waitlist-submit får inte gå sönder
 * för att en mejlleverantör är nere; raden finns kvar och kan få ett nytt mejl.
 */
export async function sendWaitlistConfirmEmail(to: string, token: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "not_configured" };

  const { subject, html } = confirmEmailContent(token);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[waitlist] Resend svarade", res.status, detail.slice(0, 200));
      return { sent: false, reason: "provider_error", detail: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[waitlist] kunde inte nå Resend:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "provider_error" };
  }
}
