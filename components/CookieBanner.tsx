"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  getStoredConsent,
  storeConsent,
  applyConsent,
  type CookieConsent,
} from "@/lib/cookieConsent";
import { bannerPosition, bannerSlideY } from "@/lib/cookie-banner-position";

async function persistToServer(consent: CookieConsent) {
  try {
    await fetch("/api/cookie-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consent),
    });
  } catch {
    // tyst — localStorage-versionen är redan sparad
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const pathname = usePathname();
  // Förankringen ligger i lib/cookie-banner-position.ts, med motiveringen och
  // en vakt. Kort version: bottenförankrad täckte onboardingens primärknapp för
  // varje ny användare, så bannern byter kant där i stället för att döljas.
  const position = bannerPosition(pathname);
  const slideY = bannerSlideY(pathname);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
    if (!getStoredConsent()) setVisible(true);
  }, []);

  function save(opts: { analytics: boolean; marketing: boolean }) {
    const consent = storeConsent({ necessary: true, ...opts });
    applyConsent(consent);
    persistToServer(consent);
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Cookie-inställningar"
          aria-modal="false"
          initial={{ y: slideY, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: slideY, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 38, mass: 0.9 }}
          // Ovanför bottendocken, inte ovanpå den. På bottom-4 låg bannern rakt
          // över alla fem flikarna i GlassNav, så en ny besökare kunde inte
          // navigera alls förrän den hanterats — trots aria-modal="false".
          // `--dock-inset` sätts av GlassNav och är 0 där docken inte finns, så
          // bannern hamnar inte högt upp i tomma luften på landningssidan.
          className={`glass fixed ${position} left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 p-5 text-foreground`}
        >
          <p className="text-sm font-semibold text-foreground">Vi använder cookies</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Nödvändiga cookies används alltid. Du kan tillåta analytics och
            marknadsföring nedan.{" "}
            <a
              href="/integritetspolicy"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Läs mer
            </a>
            .
          </p>

          <AnimatePresence initial={false}>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <Toggle
                    id="cc-necessary"
                    label="Nödvändiga"
                    description="Auth, session, Stripe. Kan inte stängas av."
                    checked={true}
                    disabled
                    onChange={() => {}}
                  />
                  <Toggle
                    id="cc-analytics"
                    label="Analytics"
                    description="Hjälper oss förstå hur sajten används (anonymt)."
                    checked={analytics}
                    onChange={setAnalytics}
                  />
                  <Toggle
                    id="cc-marketing"
                    label="Marknadsföring"
                    description="Relevanta annonser och retargeting."
                    checked={marketing}
                    onChange={setMarketing}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => save({ analytics: true, marketing: true })}
              data-cta="primary"
              className="flex-1 rounded-xl bg-pitch px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-pitch-dark active:scale-[0.97]"
            >
              Godkänn alla
            </button>
            <button
              onClick={() => save({ analytics, marketing })}
              className="glass-button flex-1 px-4 py-3.5 text-sm font-semibold text-foreground transition-colors active:scale-[0.97]"
            >
              {showDetails ? "Spara val" : "Avvisa"}
            </button>
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="min-h-11 w-full rounded-xl px-4 py-3.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showDetails ? "Dölj inställningar ↑" : "Anpassa inställningar ↓"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-pitch" : "bg-muted",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[18px]" : "",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
