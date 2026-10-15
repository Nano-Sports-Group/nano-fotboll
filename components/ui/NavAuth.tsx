"use client";

/**
 * NavAuth — Client Component
 * Hanterar auth-UI i navigationen med Clerk v7.
 * clerkEnabled=false renderar en statisk fallback (dev utan Clerk-nycklar).
 */

import Link from "next/link";
import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";
import { vertical } from "@/lib/vertical";

/** Vertikaler utan pris (golf) har ingen prissida — då finns ingen PRO-knapp heller. */
const SELLS = !vertical.hiddenRoutes.includes("/prenumerera");

// 44px klickyta, 32px synlig pill — samma visuella höjd som sökknappen och
// logotypen i 48px-headern. En 44px-pill fyllde hela raden.
function ProLink() {
  return (
    <Link
      href="/prenumerera"
      className="group inline-flex min-h-11 items-center"
    >
      <span className="inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium text-white pitch-gradient transition-opacity group-hover:opacity-90">
        PRO
      </span>
    </Link>
  );
}

// ─── Fallback (ingen Clerk) ────────────────────────────────────────────────────
function FallbackAuth() {
  if (!SELLS) return null;
  return <ProLink />;
}

// ─── Clerk-baserad auth ────────────────────────────────────────────────────────
function ClerkAuth() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return <div className="w-20 h-8 rounded-full bg-secondary animate-pulse" />;
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <SignInButton mode="modal">
          <button className="inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Logga in
          </button>
        </SignInButton>
        {SELLS && <ProLink />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/konto"
        className="inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Konto
      </Link>
      <UserButton />
    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────
export function NavAuth({ clerkEnabled }: { clerkEnabled: boolean }) {
  if (!clerkEnabled) return <FallbackAuth />;
  return <ClerkAuth />;
}
