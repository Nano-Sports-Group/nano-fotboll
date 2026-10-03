"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV_ITEMS, isNavActive } from "@/lib/nav";
import "./GlassNav.css";

/**
 * Ytan docken upptar från nedre kanten: dess egen 1rem-offset + 3.75rem höjd +
 * 0.75rem luft. Publiceras som CSS-variabel så att fixerade element som måste
 * ligga ovanför den (cookie-bannern) slipper gissa — och slipper lämna ett
 * tomrum på sidor där docken inte finns, som landningssidan.
 */
const DOCK_INSET = "4.75rem";

/**
 * Floating liquid-glass tab bar — botten-dock på alla viewports.
 * Ikoner + sliding glass thumb. Döljs på forum-tråd (compose äger bottenytan).
 */
export function GlassNav({ clerkEnabled: _clerkEnabled }: { clerkEnabled?: boolean }) {
  const pathname = usePathname();
  const hideOnThread = /^\/forum\/.+\/.+/.test(pathname);

  // Effekten MÅSTE ligga före den tidiga returen — annars ändras antalet hooks
  // när docken göms på en forumtråd och React kastar #310.
  useEffect(() => {
    const root = document.documentElement;
    // Docken är dold från `md` — då ska ingen yta reserveras ovanför den heller.
    const doldAvBrytpunkt = window.matchMedia("(min-width: 768px)").matches;
    if (hideOnThread || doldAvBrytpunkt) {
      root.style.removeProperty("--dock-inset");
      return;
    }
    root.style.setProperty("--dock-inset", DOCK_INSET);
    return () => {
      root.style.removeProperty("--dock-inset");
    };
  }, [hideOnThread]);

  if (hideOnThread) return null;

  const activeIndex = BOTTOM_NAV_ITEMS.findIndex((item) => isNavActive(item, pathname));

  return (
    // Docken är mobilnavigationen. Från `md` tar AppSidebar över med exakt
    // samma destinationer, och då blev docken ren dubblering som dessutom
    // låg och skymde innehåll mitt på skärmen (t.ex. PRO-kortets funktionslista
    // på /prenumerera). En navigation per brytpunkt.
    <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center bottom-[calc(env(safe-area-inset-bottom)+1rem)] md:hidden">
      <nav
        className="glassnav pointer-events-auto"
        aria-label="Huvudnavigation"
        style={{ ["--active" as string]: Math.max(activeIndex, 0) }}
      >
        <span
          className="glassnav__thumb"
          aria-hidden
          style={{ opacity: activeIndex === -1 ? 0 : 1 }}
        />

        {BOTTOM_NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isNavActive({ href, exact }, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              data-active={active}
              className="glassnav__item"
              onClick={(event) => {
                // Tryck på den redan aktiva fliken scrollar till toppen i stället
                // för att navigera till sig själv (mobil UX-regel 5). Utan detta
                // gör trycket ingenting alls, vilket läses som en trasig flik.
                if (!active) return;
                event.preventDefault();
                window.scrollTo({
                  top: 0,
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "auto"
                    : "smooth",
                });
              }}
            >
              <Icon strokeWidth={2} aria-hidden />
              <span className="glassnav__label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
