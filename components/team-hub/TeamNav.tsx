"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { VERTICAL } from "@/lib/vertical";
import { SwipeTabs, tabTransition } from "@/components/ui/SwipeTabs";

/**
 * TeamNav — EN persistent flikrad för alla lagrutter.
 *
 * Ersätter de två konkurrerande raderna som fanns tidigare: laghubbens
 * `?tab=`-SegmentedControl (Översikt·Statistik·Trupp·Matcher·Forum) och
 * layoutens route-flikar (Översikt·Nyheter·Statistik·Podcasts·Sammanfattning).
 * Samma etikett pekade på olika innehåll beroende på var användaren stod, och
 * hela raden byttes ut vid navigering — det förstörde den rumsliga modellen.
 *
 * Regler som håller den ärlig:
 * - Varje destination är en riktig route. Ingen `?tab=`-parallell.
 * - Raden är identisk på alla lagrutter, inklusive forumet.
 * - `aria-current="page"` markerar aktiv sektion för skärmläsare; den visuella
 *   markeringen är en fylld kapsel OCH fet text, aldrig färg ensam.
 * - Svep i sidled byter till grannsektionen (Figma "iOS Master" B · Hem). Ordningen
 *   är densamma som i apparna: Översikt · Nyheter · Matcher · Forum · Statistik · Trupp.
 *   Analys och Poddar finns bara på webben och ligger därför sist.
 */

export interface TeamNavItem {
  /** Suffix efter /lag/[slug]. Tom sträng = översikten. */
  href: string;
  label: string;
  /** Absolut route i stället för suffix — forumet lever utanför /lag. */
  absolute?: string;
  /** Bygger på Sportmonks spelar-/xG-data som bara fotbollen har — döljs på hockey. */
  footballOnly?: boolean;
}

export const TEAM_NAV_ITEMS: TeamNavItem[] = [
  { href: "", label: "Översikt" },
  { href: "/nyheter", label: "Nyheter" },
  { href: "/matcher", label: "Matcher" },
  { href: "/forum", label: "Forum", absolute: "/forum" },
  { href: "/statistik", label: "Statistik", footballOnly: true },
  { href: "/trupp", label: "Trupp" },
  { href: "/analys", label: "Analys", footballOnly: true },
  { href: "/poddar", label: "Poddar" },
];

export function TeamNav({
  slug,
  sticky = true,
  overviewHref,
  children,
}: {
  slug: string;
  /**
   * Forumsidan har en egen sticky rubrikrad pa en annan offset. Tva sticky
   * lager pa olika offsets glider over varandra vid scroll, sa dar far raden
   * folja med sidan i stallet.
   */
  sticky?: boolean;
  /** Hem (`/mitt-lag`) ÄR favoritlagets översikt — där pekar Översikt hit i stället för på /lag. */
  overviewHref?: string;
  /** Sektionens innehåll. Svep på det byter sektion. */
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/lag/${slug}`;
  const activeRef = useRef<HTMLAnchorElement>(null);

  const items = TEAM_NAV_ITEMS.filter((item) => VERTICAL === "football" || !item.footballOnly).map((item) => {
    const href = item.absolute
      ? `${item.absolute}/${slug}`
      : item.href === "" && overviewHref
        ? overviewHref
        : `${base}${item.href}`;
    const isActive = item.absolute
      ? pathname.startsWith(`${item.absolute}/${slug}`)
      : item.href === ""
        ? pathname === href
        : pathname.startsWith(href);
    return { ...item, href, isActive };
  });

  const activeIndex = items.findIndex((i) => i.isActive);

  // Kapselraden scrollar i sidled: efter ett svep ska den aktiva kapseln synas, inte ligga utanför kanten.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Lagsektioner"
        // Står still under glidövergången — det är innehållet som byts, inte raden (SwipeTabs).
        style={{ viewTransitionName: "team-nav" }}
        className={clsx(
          "translucent-chrome bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          // z-40 = samma lager som laghubbens kompaktrad, som fastnar UNDER
          // den här raden (TeamHubHeader HEADER_OFFSET). top-12 matchar global
          // Header (h-12). top-14 lämnade en 8px-svart remsa under headern.
          sticky && "sticky top-12 z-40",
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2">
          <ul className="flex gap-0.5 overflow-x-auto scrollbar-none overscroll-x-contain rounded-full bg-muted p-1 list-none m-0">
            {items.map((item, index) => (
              <li key={item.label} className="shrink-0 flex-1">
                <Link
                  ref={item.isActive ? activeRef : undefined}
                  href={item.href}
                  transitionTypes={tabTransition(activeIndex, index)}
                  aria-current={item.isActive ? "page" : undefined}
                  className={clsx(
                    // min-h-11 ≈ 44px touch target (WCAG 2.5.5).
                    "flex items-center justify-center whitespace-nowrap rounded-full px-4 min-h-11 sm:min-h-9 text-sm transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch",
                    item.isActive
                      ? "bg-background font-semibold text-foreground shadow-sm dark:bg-secondary"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      {children !== undefined && <SwipeTabs hrefs={items.map((i) => i.href)} active={activeIndex}>{children}</SwipeTabs>}
    </>
  );
}
