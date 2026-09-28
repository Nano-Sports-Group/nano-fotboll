"use client";

import Link from "next/link";
import { Container } from "./primitives";
import { CONTACT_EMAIL } from "@/lib/site-url";

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-6 pb-[max(env(safe-area-inset-bottom),24px)]">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="font-heading text-lg tracking-widest text-white/60">NANO FOTBOLL</span>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="transition-colors hover:text-white/70"
            >
              Kontakt
            </a>
            <Link
              href="/integritetspolicy"
              className="transition-colors hover:text-white/70"
            >
              Integritet & Användarvillkor
            </Link>
            <Link
              href="/ai-transparens"
              className="transition-colors hover:text-white/70"
            >
              AI-transparens
            </Link>
            <span className="text-white/55">© 2026 Nano Fotboll</span>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
