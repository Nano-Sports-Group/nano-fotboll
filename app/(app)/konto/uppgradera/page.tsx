/**
 * /konto/uppgradera — dit "uppgradera mitt konto" leder, från webben och från apparna.
 *
 * Allt som visas kommer ur servern: planen ur `getUserPlan()`, summorna ur Stripes förhandsfaktura
 * (`previewUpgrade`). Klienten får bara en knapp.
 */
import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Check } from "lucide-react";
import { formatKr, formatWeeklyKr } from "@/lib/pricing";
import { getUserPlan } from "@/lib/user-plan";
import { loadUpgradeSubject, previewUpgrade, type UpgradePreviewView } from "@/lib/billing/upgrade-stripe";
import { isHandoffPlatform } from "@/lib/billing/web-handoff";
import { ELITE_FEATURES } from "../../prenumerera/plan-copy";
import { UpgradeConfirm } from "./UpgradeConfirm";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Uppgradera till Elite",
    description: "Byt från PRO till Elite på din befintliga prenumeration.",
    robots: { index: false, follow: false },
  };
}

type View =
  | { kind: "free" }
  | { kind: "elite" }
  | { kind: "blocked"; reason: string }
  | { kind: "error" }
  | { kind: "preview"; preview: UpgradePreviewView };

async function loadView(userId: string): Promise<View> {
  const plan = await getUserPlan();
  if (plan === "free") return { kind: "free" };
  if (plan === "elite") return { kind: "elite" };
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
    const subject = await loadUpgradeSubject(stripe, await clerkClient(), userId);
    if (!subject.eligible) return subject.code === "already_elite" ? { kind: "elite" } : { kind: "blocked", reason: subject.reason };
    return { kind: "preview", preview: await previewUpgrade(stripe, subject) };
  } catch (err) {
    console.error("[konto/uppgradera]", err instanceof Error ? err.message : err);
    return { kind: "error" };
  }
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });

function Shell({ children, from }: { children: React.ReactNode; from: string | null }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-foreground text-balance">Uppgradera till Elite</h1>
      <div className="mt-6">{children}</div>
      {from && <p className="mt-10 text-center text-xs text-muted-foreground">Du kan gå tillbaka till appen när du är klar.</p>}
    </div>
  );
}

function Message({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-sm text-foreground">{text}</p>
      <Link
        href={href}
        data-cta="primary"
        className="mt-4 flex h-11 w-full items-center justify-center rounded-xl pitch-gradient text-sm font-medium text-white hover:opacity-90"
      >
        {label}
      </Link>
    </div>
  );
}

export default async function UppgraderaPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from: rawFrom } = await searchParams;
  const from = isHandoffPlatform(rawFrom) ? rawFrom : null;

  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/konto/uppgradera${from ? `?from=${from}` : ""}`)}`);
  }

  const view = await loadView(userId);

  if (view.kind === "free") {
    return (
      <Shell from={from}>
        <Message
          text="Elite är ett steg upp från PRO. Du har ingen betald plan än, så börja med att välja en."
          href="/prenumerera"
          label="Se planerna"
        />
      </Shell>
    );
  }
  if (view.kind === "elite") {
    return (
      <Shell from={from}>
        <Message text="Du har Elite." href="/konto" label="Till kontot" />
      </Shell>
    );
  }
  if (view.kind === "blocked") {
    return (
      <Shell from={from}>
        <Message text={view.reason} href="/konto" label="Till kontot" />
      </Shell>
    );
  }
  if (view.kind === "error") {
    return (
      <Shell from={from}>
        <Message
          text="Vi kunde inte räkna ut uppgraderingen just nu och har inte ändrat något. Ladda om sidan om en stund."
          href="/konto"
          label="Till kontot"
        />
      </Shell>
    );
  }

  const { preview } = view;
  const unit = preview.interval === "year" ? "år" : "mån";
  return (
    <Shell from={from}>
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground">Elite lägger till</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {ELITE_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-pitch-ink" aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <dl className="mt-6 border-t border-border pt-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-foreground">Elite</dt>
            <dd className="font-semibold text-foreground tabular-nums">
              {formatKr(preview.newPriceOre)} / {unit}
            </dd>
          </div>
          <p className="mt-1 text-right text-xs text-muted-foreground">{formatWeeklyKr(preview.newPriceOre, preview.interval)}</p>

          {preview.trialing ? (
            <p className="mt-4 text-foreground">
              Inget dras nu. Din provperiod fortsätter som vanligt, och första debiteringen
              {preview.nextRenewalAt ? ` den ${day(preview.nextRenewalAt)}` : ""} blir Elite-priset.
            </p>
          ) : (
            <>
              {preview.creditOre > 0 && (
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <dt className="text-foreground">Avräknas för tiden du redan betalat</dt>
                  <dd className="text-foreground tabular-nums">−{formatKr(preview.creditOre)}</dd>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between gap-4">
                <dt className="font-medium text-foreground">Dras nu</dt>
                <dd className="font-semibold text-foreground tabular-nums">{formatKr(preview.amountDueNowOre)}</dd>
              </div>
              {preview.nextRenewalAt && (
                <div className="mt-2 flex items-baseline justify-between gap-4">
                  <dt className="text-foreground">Nästa förnyelse</dt>
                  <dd className="text-foreground">{day(preview.nextRenewalAt)}</dd>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Din nya period börjar i dag.</p>
            </>
          )}
        </dl>

        <UpgradeConfirm />
      </section>
    </Shell>
  );
}
