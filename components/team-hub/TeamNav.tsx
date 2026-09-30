"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { VERTICAL } from "@/lib/vertical";

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
 *   markeringen är understruken OCH färgad, aldrig färg ensam.
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
  { href: "/analys", label: "Analys", footballOnly: true },
  { href: "/matcher", label: "Matcher" },
  { href: "/trupp", label: "Trupp", footballOnly: true },
  { href: "/statistik", label: "Statistik", footballOnly: true },
  { href: "/poddar", label: "Poddar" },
  { href: "/forum", label: "Forum", absolute: "/forum" },
];

export function TeamNav({
  slug,
  sticky = true,
}: {
  slug: string;
  /**
   * Forumsidan har en egen sticky rubrikrad pa en annan offset. Tva sticky
   * lager pa olika offsets glider over varandra vid scroll, sa dar far raden
   * folja med sidan i stallet.
   */
  sticky?: boolean;
}) {
  const pathname = usePathname();
  const base = `/lag/${slug}`;

  return (
    <nav
      aria-label="Lagsektioner"
      className={clsx(
        "translucent-chrome border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        // z-40 = samma lager som laghubbens kompaktrad, som fastnar UNDER
        // den här raden (TeamHubHeader HEADER_OFFSET). top-12 matchar global
        // Header (h-12). top-14 lämnade en 8px-svart remsa under headern.
        sticky && "sticky top-12 z-40",
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ul className="flex gap-1 overflow-x-auto scrollbar-none -mb-px list-none m-0 p-0">
          {TEAM_NAV_ITEMS.filter((item) => VERTICAL === "football" || !item.footballOnly).map((item) => {
            const href = item.absolute ? `${item.absolute}/${slug}` : `${base}${item.href}`;
            const isActive = item.absolute
              ? pathname.startsWith(`${item.absolute}/${slug}`)
              : item.href === ""
                ? pathname === base
                : pathname.startsWith(href);

            return (
              <li key={item.label} className="shrink-0">
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    // min-h-11 ≈ 44px touch target (WCAG 2.5.5).
                    "flex items-center whitespace-nowrap px-4 min-h-11 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-pitch text-pitch-ink"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
