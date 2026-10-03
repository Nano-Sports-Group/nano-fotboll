import type { Metadata } from "next";
import {
  Sparkles,
  Headphones,
  User,
  CreditCard,
  Info,
  BarChart3,
  FileSearch,
  MessageSquare,
} from "lucide-react";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import { BOTTOM_NAV_ITEMS } from "@/lib/nav";
import { vertical } from "@/lib/vertical";

/** Syns inte här: vertikalens dolda ytor och det som redan är en flik i bottenraden. */
const hidden = (href: string) => vertical.hiddenRoutes.includes(href) || BOTTOM_NAV_ITEMS.some((tab) => tab.href === href);

/** Utforska-raderna. Vertikalens dolda ytor (hiddenRoutes) visas inte. */
const DISCOVER = [
  { href: "/forum", icon: <MessageSquare />, title: "Forum", subtitle: "Diskutera med andra supporters" },
  { href: "/statistik", icon: <BarChart3 />, title: "Statistik", subtitle: "Lag, tabeller och jämförelser" },
  { href: "/analys", icon: <FileSearch />, title: "Matchanalyser", subtitle: "xG, pressure och form efter varje match" },
  { href: "/daily", icon: <Headphones />, title: vertical.dailyName, subtitle: "7 min morgonbrief, lyssna här" },
  { href: "/podcast", icon: <Headphones />, title: "Poddar", subtitle: `${vertical.leagueName}-poddar samlade` },
  { href: "/ai", icon: <Sparkles />, title: "Fråga", subtitle: "Statistik, matcher och nyheter när du vill gräva" },
];

export const metadata: Metadata = {
  title: "Mer",
  description: "Forum, statistik, konto och prenumeration.",
};

/** Overflow utanför bottenraden (Mitt lag · Flöde · Matcher · Tabellen). */
export default function MerPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-6 pb-24">
      <h1 className="text-2xl font-bold text-balance" style={{ fontFamily: "var(--font-display)" }}>
        MER
      </h1>

      <ListGroup>
        {DISCOVER.filter((row) => !hidden(row.href)).map((row) => (
          <ListRow key={row.href} href={row.href} leading={row.icon} title={row.title} subtitle={row.subtitle} />
        ))}
      </ListGroup>

      <ListGroup>
        <ListRow href="/konto" leading={<User />} title="Konto" />
        {!hidden("/prenumerera") && <ListRow href="/prenumerera" leading={<CreditCard />} title="Prenumeration" />}
        <ListRow href="/om-oss" leading={<Info />} title={vertical.aboutLabel} />
      </ListGroup>
    </div>
  );
}
