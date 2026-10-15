"use client";

import { useEffect, useRef, ViewTransition } from "react";
import { useRouter } from "next/navigation";
import { project } from "@/lib/gesture";

/** Kantzonen tillhör tillbaka-gesten (EdgeSwipeBack / Safari) — ett svep härifrån byter aldrig flik. */
const EDGE_ZONE_PX = 28;
/** Projicerad sträcka som krävs för att byta sektion. */
const COMMIT_PX = 72;
/** Mer vertikalt än så här = användaren scrollar sidan, inte sveper. */
const MAX_VERTICAL_RATIO = 0.6;

/** Riktningen på bytet: nästa sektion glider in från höger, föregående från vänster. */
export function tabTransition(from: number, to: number): string[] | undefined {
  if (from < 0 || from === to) return undefined;
  return [to > from ? "tab-forward" : "tab-back"];
}

const SLIDE = { "tab-forward": "tab-forward", "tab-back": "tab-back", default: "none" } as const;

/** Ligger fingret på något som själv scrollar i sidled (karusell, bred tabell)? Då är svepet dess. */
function insideHorizontalScroller(el: Element | null, stop: Element): boolean {
  for (let node = el; node && node !== stop; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

/**
 * Svep vänster/höger på innehållet = nästa/föregående syskonsektion (X-mönstret, Figma B · Hem).
 *
 * Sektionerna är riktiga routes, så svepet navigerar i stället för att glida en pager —
 * varje sektion behåller sin URL, sin ISR och sin delningslänk. Grannarna förhämtas
 * så bytet känns omedelbart.
 *
 * Bytet glider (View Transitions, `tab-forward`/`tab-back` i globals.css) medan
 * kapselraden står still. ponytail: ingen 1:1-följning under själva draget —
 * `transform` på en wrapper hade blivit containing block för `position: fixed`-barn
 * (se EdgeSwipeBack). Apparna följer fingret; webben glider när svepet släpps.
 */
export function SwipeTabs({
  hrefs,
  active,
  children,
}: {
  hrefs: string[];
  /** Index i `hrefs` för sidan som visas; -1 = ingen (svep gör ingenting). */
  active: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const prev = active > 0 ? hrefs[active - 1] : undefined;
  const next = active >= 0 && active < hrefs.length - 1 ? hrefs[active + 1] : undefined;

  useEffect(() => {
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [router, prev, next]);

  useEffect(() => {
    const root = ref.current;
    if (!root || active < 0) return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 &&
        t.clientX > EDGE_ZONE_PX &&
        t.clientX < window.innerWidth - EDGE_ZONE_PX &&
        !insideHorizontalScroller(e.target as Element, root)
          ? { x: t.clientX, y: t.clientY, t: e.timeStamp }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const velocity = (dx / Math.max(e.timeStamp - start.t, 1)) * 1000;
      start = null;
      if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return;
      const travel = dx + project(velocity);
      const target = travel <= -COMMIT_PX ? next : travel >= COMMIT_PX ? prev : undefined;
      if (!target) return;
      navigator.vibrate?.(8);
      router.push(target, { scroll: false, transitionTypes: tabTransition(active, hrefs.indexOf(target)) });
    };

    const onCancel = () => (start = null);

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onCancel);
    };
  }, [router, active, prev, next]);

  // touch-action: pan-y — webbläsaren äger vertikal scroll, vi läser bara av sidledssvepet.
  return (
    <div ref={ref} className="touch-pan-y">
      <ViewTransition key={hrefs[active] ?? "none"} enter={SLIDE} exit={SLIDE} default="none">
        <div>{children}</div>
      </ViewTransition>
    </div>
  );
}
