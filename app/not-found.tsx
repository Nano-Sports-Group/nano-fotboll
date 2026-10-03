import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Newspaper, Shield, CalendarDays } from "lucide-react";
import { vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: "Sidan hittades inte",
  robots: { index: false, follow: true },
};

/**
 * 404 renderas i root-layouten — utan header, sidebar eller bottendock.
 * Utan egna vägar vidare blir den en återvändsgränd, så sidan bär sin egen
 * wayfinding till de fyra ytor folk faktiskt söker.
 */
const DESTINATIONS =
  vertical.id === "golf"
    ? [
        { href: "/golf", label: "Hem", desc: "Nano Golf", icon: Trophy },
        { href: "/nyheter", label: "Flöde", desc: "Senaste kring svensk golf", icon: Newspaper },
        { href: "/om-oss", label: "Om Nano Golf", desc: "Vad som finns och vad som kommer", icon: Shield },
      ]
    : [
        { href: vertical.leaguePath, label: vertical.leagueName, desc: "Tabell, resultat och spelschema", icon: Trophy },
        { href: "/nyheter", label: "Flöde", desc: vertical.id === "hockey" ? "Senaste kring svensk hockey" : "Senaste kring svensk fotboll", icon: Newspaper },
        { href: "/mitt-lag", label: "Mitt lag", desc: "Allt om din klubb", icon: Shield },
        { href: "/match", label: "Matcher", desc: "Kommande och pågående", icon: CalendarDays },
      ];

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-5 py-20 focus:outline-none sm:py-28">
      <p className="font-mono text-sm tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl text-balance">
        Sidan hittades inte
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        Länken kan vara trasig eller så har sidan flyttat. Här är vägarna tillbaka.
      </p>

      <nav aria-label="Populära sidor" className="mt-10 grid gap-2 sm:grid-cols-2">
        {DESTINATIONS.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-[64px] items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3
              transition-colors hover:border-pitch/40 hover:bg-pitch/5
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Icon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-pitch-ink"
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-foreground">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{desc}</span>
            </span>
          </Link>
        ))}
      </nav>

      <p className="mt-8 text-sm text-muted-foreground">
        Eller gå till{" "}
        <Link
          href="/"
          className="font-medium text-pitch-ink underline underline-offset-4 hover:no-underline
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          startsidan
        </Link>
        .
      </p>
    </main>
  );
}
