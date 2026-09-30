"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { project, rubberband } from "@/lib/gesture";

/** Gesten startar bara om fingret landar inom denna zon från vänsterkanten. */
const EDGE_ZONE_PX = 28;
/** Horisontell rörelse som krävs för att räknas som "tillbaka". */
const COMMIT_PX = 64;
/** Mer vertikalt än horisontellt = användaren scrollar, inte backar. */
const MAX_VERTICAL_RATIO = 0.7;
/** Rörelse innan vi låser riktning — hysteres, så ett stillastående finger inte committar. */
const DIRECTION_HYSTERESIS_PX = 10;
/** Så långt följer indikatorn med innan motståndet tar över. */
const MAX_TRACK_PX = 96;

/** Indikatorns läge vid ett givet drag. */
const track = (dx: number) => rubberband(dx, MAX_TRACK_PX);

/**
 * Svep från vänsterkanten = tillbaka (mobil UX-regel 2).
 *
 * Aktiveras BARA i installerad standalone-PWA på iOS. Skälet är konkret: där
 * finns ingen kantgest alls, medan Safari i webbläsarläge och Android i
 * standalone redan har en egen — och två hanterare på samma svep hade backat
 * två steg. Regeln uppfylls alltså av plattformen där plattformen klarar det,
 * och av oss där den inte gör det.
 *
 * Gesten ger kontinuerlig feedback UNDER svepet, inte bara ett hopp vid släpp:
 * en kantpil följer fingret 1:1 med gummiband och fyller i sig när svepet
 * passerat commit-läget. Indikatorn — inte sidan — är det som rör sig:
 * `transform` på en wrapper runt innehållet hade gjort den till containing
 * block för varje `position: fixed`-barn (modaler, docken) och brutit dem,
 * samma skäl som PullToRefreshShell dokumenterar.
 */
export function EdgeSwipeBack() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const last = useRef<{ x: number; t: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    // iPadOS 13+ rapporterar "MacIntel" med touch — därav maxTouchPoints-ledet.
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
    setEnabled(standalone && ios);
  }, []);

  const reset = useCallback(() => {
    start.current = null;
    last.current = null;
    setSettling(true);
    setDrag(0);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1 || touch.clientX > EDGE_ZONE_PX) {
        start.current = null;
        return;
      }
      start.current = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
      last.current = { x: touch.clientX, t: event.timeStamp };
      setSettling(false);
    }

    function onTouchMove(event: TouchEvent) {
      const origin = start.current;
      const touch = event.touches[0];
      if (!origin || !touch) return;

      const dx = touch.clientX - origin.x;
      const dy = Math.abs(touch.clientY - origin.y);

      // Hysteres: avgör riktning först efter ~10 px, och avbryt gesten helt om
      // den visar sig vara en scroll. Att bara ignorera hade lämnat indikatorn
      // hängande kvar mitt i en vertikal scroll.
      if (dx < DIRECTION_HYSTERESIS_PX && dy < DIRECTION_HYSTERESIS_PX) return;
      if (dy > dx * MAX_VERTICAL_RATIO) {
        reset();
        return;
      }

      last.current = { x: touch.clientX, t: event.timeStamp };
      // Gummiband: följer nästan 1:1 i början, styvnar progressivt.
      setDrag(track(dx));
    }

    function onTouchEnd(event: TouchEvent) {
      const origin = start.current;
      const previous = last.current;
      const touch = event.changedTouches[0];
      reset();
      if (!origin || !touch) return;

      const dx = touch.clientX - origin.x;
      const dy = Math.abs(touch.clientY - origin.y);
      if (dy > dx * MAX_VERTICAL_RATIO) return;

      // Hastigheten ur de sista millisekunderna, inte ur hela gesten: ett
      // långsamt drag som slutar i en snärt ska räknas som en snärt.
      const dt = Math.max(1, event.timeStamp - (previous?.t ?? origin.t));
      const velocity = ((touch.clientX - (previous?.x ?? origin.x)) / dt) * 1000;
      if (dx + project(velocity) < COMMIT_PX) return;
      // Aldrig backa ut ur appen till en tom historik.
      if (window.history.length <= 1) return;

      router.back();
    }

    function onTouchCancel() {
      reset();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, reset, router]);

  // Andelen av commit-sträckan som passerats — pilen fyller i sig när släpp
  // just nu skulle backa, så utfallet syns innan fingret lyfts.
  const progress = Math.min(1, drag / track(COMMIT_PX));
  const armed = progress >= 1;

  return (
    <>
      {/* Markör så att vakten i tests/e2e/ux-rules.spec.ts kan se att hanteraren är monterad. */}
      <span hidden data-edge-swipe-back={enabled ? "active" : "native"} />
      {enabled && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-1/2 z-[70] -translate-y-1/2 md:hidden"
          style={{
            transform: `translate3d(${drag - 44}px, -50%, 0)`,
            opacity: drag > 2 ? Math.min(1, progress + 0.3) : 0,
            // Ingen transition medan fingret är nere: rörelsen ska vara 1:1.
            // Först vid släpp lägger vi på en kort spring-lik återgång.
            transition: settling
              ? "transform 280ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease"
              : "none",
          }}
        >
          <span
            className={
              armed
                ? "flex size-11 items-center justify-center rounded-full border border-pitch bg-pitch shadow-lg transition-colors duration-150"
                : "flex size-11 items-center justify-center rounded-full border border-border bg-background/85 shadow-lg backdrop-blur transition-colors duration-150"
            }
          >
            <ChevronLeft className={armed ? "size-5 text-white" : "size-5 text-muted-foreground"} />
          </span>
        </div>
      )}
    </>
  );
}
