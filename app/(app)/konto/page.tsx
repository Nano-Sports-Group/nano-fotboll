/**
 * app/konto/page.tsx — Kontosida (PRO-gate i middleware)
 * ─────────────────────────────────────────────────────────────────────────────
 * - Visar plan-status (PRO / Free)
 * - Stripe Customer Portal-länk för att hantera/avbryta prenumeration
 * - Clerk UserProfile-länk
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { AlertTriangle, Check, CreditCard, User } from "lucide-react";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import {
  ANNUAL_DISCOUNT,
  TRIAL_DAYS,
  formatWeeklyKr,
  listMonthlyKr,

  proPriceLabel,
  PRICING,
  FOUNDER_OFFER,
  isComboEnabled,
  ELITE_AVAILABLE,
} from "@/lib/pricing";
import { isFounderOfferPublic } from "@/lib/founder-offer";
import { planForVertical } from "@/lib/plan-for-vertical";
import { SportAccess } from "./SportAccess";
import { getSiteUrl } from "@/lib/site-url";
import Stripe from "stripe";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Mitt konto",
  description: "Hantera din prenumeration och dina kontoinställningar.",
};

// ─── Stripe Portal URL ─────────────────────────────────────────────────────────
async function getBillingPortalUrl(customerId: string): Promise<string | null> {
  // Lazy-init för att undvika build-time env-krav
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getSiteUrl()}/konto`,
      locale: "sv",
    });
    return session.url;
  } catch {
    return null;
  }
}

export default async function KontoPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; upgraded?: string }>;
}) {
  const { userId } = await auth();
  const user = await currentUser();
  const publicMeta = (user?.publicMetadata ?? {}) as { plan?: string; plans?: unknown; founder?: boolean };
  // Märket sitter på ett genomfört Founder-köp och följer med för alltid — även
  // när potten är slut för alla andra. Potten avgör bara vad vi ERBJUDER.
  const isFounder = publicMeta.founder === true;
  const founderPublic = await isFounderOfferPublic();
  const privateMeta = (user?.privateMetadata ?? {}) as {
    stripeCustomerId?: string;
    subscription?: {
      currentPeriodEnd?: string;
      cancelAtPeriodEnd?: boolean;
    } | null;
  };

  const plan = publicMeta.plan ?? "free";
  const isPaid = plan === "pro" || plan === "elite";
  const planLabel = plan === "elite" ? "ELITE" : plan === "pro" ? "PRO" : "GRATIS";
  const { checkout, upgraded } = await searchParams;

  const periodEndFormatted = privateMeta.subscription?.currentPeriodEnd
    ? new Date(privateMeta.subscription.currentPeriodEnd).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const portalUrl = privateMeta.stripeCustomerId
    ? await getBillingPortalUrl(privateMeta.stripeCustomerId)
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      {/* Välkommen-banner efter checkout. Webhook-lagg: Stripe kan landa
          användaren här innan checkout.session.completed hunnit sätta plan. */}
      {checkout === "success" && isPaid && (
        <div className="mb-8 p-5 rounded-xl border border-pitch/40 bg-pitch/10">
          <p className="flex items-center gap-2 text-pitch-ink text-sm font-medium">
            <Check className="w-4 h-4" />
            Välkommen! Din {planLabel}-prenumeration är aktiv.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Upplåst: obegränsat flöde, AI-sammanfattningar, smart ranking,
            avancerade filter och push-notiser{plan === "elite" ? " — plus clustering och daglig AI-brief" : ""}.
          </p>
          <Link
            href="/nyheter"
            className="mt-3 inline-block rounded-lg pitch-gradient px-4 py-2 text-sm font-medium text-white"
          >
            Gå till din feed
          </Link>
        </div>
      )}
      {/* Efter uppgradering PRO → Elite (/konto/uppgradera). Rutten synkar rättigheterna före svaret,
          men Clerk-sessionen kan ligga ett ögonblick efter. */}
      {upgraded === "elite" && plan === "elite" && (
        <div className="mb-8 p-5 rounded-xl border border-pitch/40 bg-pitch/10">
          <p className="flex items-center gap-2 text-pitch-ink text-sm font-medium">
            <Check className="w-4 h-4" />
            Du har Elite. Uppgraderingen är genomförd.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Du har nu clustering, trend detection och &rdquo;vad som spelar roll idag&rdquo; för ditt lag.
          </p>
        </div>
      )}
      {upgraded === "elite" && plan !== "elite" && (
        <div className="mb-8 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Uppgraderingen är genomförd — Elite aktiveras inom någon minut. Ladda om sidan om det dröjer.
        </div>
      )}
      {checkout === "success" && !isPaid && (
        <div className="mb-8 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Betalningen är genomförd — kontot uppgraderas inom någon minut. Ladda om sidan om det dröjer.
        </div>
      )}

      {/* Profilhuvud — centrerad avatar + namn + planbadge, Grok/iOS-settings-mönster */}
      <Link
        href="/profil"
        className="mb-8 flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center transition-colors hover:bg-card/40 active:bg-card/60"
      >
        <span className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-2xl font-semibold text-muted-foreground ring-1 ring-border">
          {user?.imageUrl ? (
            <Image src={user.imageUrl} alt="" fill className="object-cover" sizes="80px" />
          ) : (
            (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "?").toUpperCase()
          )}
        </span>
        <span>
          <span className="block text-xl font-bold text-foreground">
            {user?.fullName ?? user?.firstName ?? "Din profil"}
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            {isPaid ? (
              <span className="rounded-full pitch-gradient px-2 py-0.5 text-xs font-semibold text-white">
                {planLabel}
              </span>
            ) : (
              "Gratis"
            )}
            {/* Tyst textpill. Ingen guldmedalj, ingen konfetti. */}
            {isFounder && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Founder
              </span>
            )}
          </span>
        </span>
      </Link>

      <div className="space-y-6">
        {/* Användarinfo */}
        <ListGroup header="Profil">
          <ListRow
            href="/profil"
            leading={<User />}
            title="Min profil"
            subtitle="Redigera nickname, bio, profilbild och lag"
          />
          <ListRow
            leading={<User />}
            title="E-post"
            trailing={<span className="text-foreground">{user?.emailAddresses?.[0]?.emailAddress ?? "–"}</span>}
          />
          <ListRow
            title="Användar-ID"
            trailing={<span className="font-mono text-xs text-foreground">{userId}</span>}
          />
        </ListGroup>

        {/* Plan-status */}
        <ListGroup
          header="Prenumeration"
          footer={
            isPaid
              ? "Ingår: fullständiga AI-transkript, djupanalys & sentiment, prioriterad support."
              : "Uppgradera för daglig AI-brief, poddintelligens och transfer-signaler."
          }
        >
          <ListRow
            leading={<CreditCard />}
            title="Nuvarande plan"
            trailing={
              isPaid ? (
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-pitch-ink">{planLabel}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full pitch-gradient text-white">Aktiv</span>
                </span>
              ) : (
                <span className="font-semibold text-foreground">GRATIS</span>
              )
            }
          />
          {isComboEnabled() && (
            <SportAccess
              footballPlan={planForVertical("football", publicMeta)}
              hockeyPlan={planForVertical("hockey", publicMeta)}
            />
          )}
          {privateMeta.subscription?.cancelAtPeriodEnd && periodEndFormatted && (
            <ListRow
              leading={<AlertTriangle className="text-amber-400" />}
              title="Prenumerationen avslutas"
              subtitle={`Du har tillgång till ${periodEndFormatted}. Förnya via "Hantera prenumeration".`}
            />
          )}
          {isPaid && !privateMeta.subscription?.cancelAtPeriodEnd && periodEndFormatted && (
            <ListRow
              title="Förnyas"
              trailing={<span className="text-foreground text-sm">{periodEndFormatted}</span>}
            />
          )}
          {plan === "pro" && ELITE_AVAILABLE && !privateMeta.subscription?.cancelAtPeriodEnd && (
            <ListRow
              href="/konto/uppgradera"
              title="Uppgradera till Elite"
              subtitle="Det du redan betalat avräknas"
              trailing={<Check className="w-4 h-4 text-pitch-ink" />}
            />
          )}
          {isPaid && portalUrl ? (
            <ListRow
              href={portalUrl}
              title="Hantera prenumeration"
              subtitle="Byt plan, uppdatera kort eller avsluta — via Stripe"
            />
          ) : (
            <ListRow
              href="/prenumerera"
              title={isPaid ? "Byt plan" : "Uppgradera till PRO"}
              subtitle={
                isPaid
                  ? undefined
                  : founderPublic
                    ? `Founder ${proPriceLabel(true)} för alltid (ordinarie ${listMonthlyKr("pro")} kr) · ${formatWeeklyKr(FOUNDER_OFFER.pricing.monthly)} · ${TRIAL_DAYS} dagar gratis`
                    : `${proPriceLabel(false)} · ${formatWeeklyKr(PRICING.pro.monthly)} · ${TRIAL_DAYS} dagar gratis · ${Math.round(ANNUAL_DISCOUNT * 100)} % rabatt årsvis`
              }
              trailing={<Check className="w-4 h-4 text-pitch-ink" />}
            />
          )}
        </ListGroup>
      </div>
    </div>
  );
}
