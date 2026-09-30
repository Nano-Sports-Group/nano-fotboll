import type { Metadata } from "next";
import { vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: `AI-chatt — fråga om ${vertical.leagueName} | ${vertical.productName}`,
  description:
    `Ställ frågor om ${vertical.leagueName} — tabell, form och statistik. ${vertical.productName}s AI svarar med synkad data.`,
};

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
