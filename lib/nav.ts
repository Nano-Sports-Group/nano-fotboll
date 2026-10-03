import {
  House,
  Newspaper,
  MessageSquare,
  Trophy,
  CalendarDays,
  BarChart3,
  Sparkles,
  Headphones,
  User,
  CreditCard,
  Info,
  FileSearch,
  Ellipsis,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { leagueHref, vertical } from "@/lib/vertical";

/**
 * Enda källan för top-level-navigering.
 *
 * Botten = dagliga vanor. Hem längst till vänster, Profil längst till höger,
 * max 5 flikar (`context/mobile_ux_rules.md` regel 3). AI är infrastruktur,
 * inte en flik. Sidobar = samma fem + Mer.
 * Mer/hamburger = overflow (forum, statistik, fråga, konto …).
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** SF Symbol för samma destination i den genererade iOS-navigationen. */
  iosSymbol: string;
  /** Matcha bara exakt path, inte startsWith — annars matchar "/" allt. */
  exact?: boolean;
}

/**
 * Mobil (+ alltid synlig) bottenrad. Ordningen är ett krav, inte en smaksak:
 * Hem först, Profil sist. `/mitt-lag` ÄR hemmet i ett supporter-OS — favoritlagets
 * dag är startskärmen, så Hem-fliken pekar dit i stället för på en tom aggregatsida.
 *
 * Max 5 poster. Behöver en sjätte destination plats hör den under Mer.
 */
const TEAM_SPORT_NAV: NavItem[] = [
  { href: "/mitt-lag", label: "Hem", icon: House, iosSymbol: "house.fill" },
  { href: "/nyheter", label: "Flöde", icon: Newspaper, iosSymbol: "newspaper.fill" },
  { href: "/match", label: "Matcher", icon: CalendarDays, iosSymbol: "calendar" },
  { href: leagueHref(), label: "Tabellen", icon: Trophy, iosSymbol: "trophy.fill" },
  { href: "/profil", label: "Profil", icon: User, iosSymbol: "person.crop.circle.fill" },
];

/** Golf har varken lag, matcher eller tabell: hem, flöde, profil. */
const GOLF_NAV: NavItem[] = [
  { href: "/golf", label: "Hem", icon: House, iosSymbol: "house.fill" },
  { href: "/nyheter", label: "Flöde", icon: Newspaper, iosSymbol: "newspaper.fill" },
  { href: "/profil", label: "Profil", icon: User, iosSymbol: "person.crop.circle.fill" },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = vertical.id === "golf" ? GOLF_NAV : TEAM_SPORT_NAV;

/** Bottenraden får aldrig växa förbi detta. Låst av `lib/nav.test.ts`. */
export const MAX_BOTTOM_NAV_ITEMS = 5;

/**
 * Desktop-sidobar — bottenflikar + en overflow-ingång.
 * Forum/statistik/analys ligger under Mer, inte som egna chrome-rader.
 */
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  ...BOTTOM_NAV_ITEMS,
  { href: "/mer", label: "Mer", icon: Ellipsis, iosSymbol: "line.3.horizontal" },
];

/**
 * Overflow: Mer-sida + hamburger. Inga dubbletter mot bottenraden — och
 * ingen `/mer`-post, eftersom Mer-sidan då hade listat sig själv.
 *
 * Djupa rutter (`/lag/[slug]/...`) markerar med flit INGEN flik: en laghubb
 * nås från flera flikar, och att gissa fel förälder är sämre än att låta
 * GlassNav-tummen tona ut (den gör det redan vid activeIndex === -1).
 */
const ALL_SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: "/statistik", label: "Statistik", icon: BarChart3, iosSymbol: "chart.bar.fill" },
  { href: "/forum", label: "Forum", icon: MessageSquare, iosSymbol: "bubble.left.and.bubble.right.fill" },
  { href: "/analys", label: "Matchanalyser", icon: FileSearch, iosSymbol: "doc.text.magnifyingglass" },
  { href: "/daily", label: vertical.dailyName, icon: Headphones, iosSymbol: "headphones" },
  { href: "/podcast", label: "Poddar", icon: Headphones, iosSymbol: "waveform" },
  { href: "/ai", label: "Fråga", icon: Sparkles, iosSymbol: "sparkles" },
  { href: "/konto", label: "Konto", icon: User, iosSymbol: "person.crop.circle" },
  { href: "/prenumerera", label: "Prenumeration", icon: CreditCard, iosSymbol: "creditcard.fill" },
  { href: "/om-oss", label: vertical.aboutLabel, icon: Info, iosSymbol: "info.circle" },
];

/** Vertikalens dolda ytor (lib/vertical.ts → hiddenRoutes) och det som redan är en flik syns inte i menyn. */
export const SECONDARY_NAV_ITEMS: NavItem[] = ALL_SECONDARY_NAV_ITEMS.filter(
  (item) => !vertical.hiddenRoutes.includes(item.href) && !BOTTOM_NAV_ITEMS.some((tab) => tab.href === item.href),
);

/** @deprecated Använd BOTTOM_NAV_ITEMS — behålls för tillfälliga imports. */
export const NAV_ITEMS = BOTTOM_NAV_ITEMS;
