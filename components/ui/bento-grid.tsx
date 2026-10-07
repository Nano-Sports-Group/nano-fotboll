"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  cta?: string;
  href?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
}

interface BentoGridProps {
  items: BentoItem[];
  className?: string;
}

export function BentoCard({ item, className }: { item: BentoItem; className?: string }) {
  const card = (
    <div
      className={cn(
        "group relative h-full p-5 rounded-xl overflow-hidden transition-all duration-300",
        "border border-white/[0.08] bg-white/[0.025]",
        "hover:shadow-[0_2px_16px_color-mix(in_srgb,var(--pitch)_8%,transparent)] hover:border-white/[0.16]",
        "hover:-translate-y-0.5 will-change-transform",
        {
          "shadow-[0_2px_16px_color-mix(in_srgb,var(--pitch)_8%,transparent)] -translate-y-0.5 border-white/[0.16]":
            item.hasPersistentHover,
        },
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:4px_4px]" />
      </div>

      <div className="relative flex h-full flex-col space-y-3">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-pitch/10 border border-pitch/15">
            {item.icon}
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-lg bg-white/[0.06] text-white/60 transition-colors duration-300 group-hover:bg-white/[0.1]">
            {item.status ?? "Nyhet"}
          </span>
        </div>

        <div className="space-y-2 flex-1">
          <h3 className="font-sans font-semibold text-white tracking-tight text-[15px] leading-snug text-balance">
            {item.title}
            {item.meta && (
              <span className="ml-2 text-xs text-white/40 font-normal">{item.meta}</span>
            )}
          </h3>
          <p className="text-sm text-white/55 leading-relaxed line-clamp-3">
            {item.description}
          </p>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2 text-xs text-white/40">
            {item.tags?.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-md bg-white/[0.06] transition-all duration-200 group-hover:bg-white/[0.1]"
              >
                #{tag}
              </span>
            ))}
          </div>
          <span className="text-xs text-pitch-ink opacity-0 group-hover:opacity-100 transition-opacity">
            {item.cta ?? "Läs mer →"}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 -z-10 rounded-xl p-px bg-gradient-to-br from-transparent via-white/[0.08] to-transparent transition-opacity duration-300",
          item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      />
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block h-full">
        {card}
      </Link>
    );
  }
  return card;
}

export function BentoGrid({ items, className }: BentoGridProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3 w-full", className)}>
      {items.map((item, index) => (
        <div key={index} className={cn(item.colSpan === 2 ? "md:col-span-2" : "col-span-1")}>
          <BentoCard item={item} />
        </div>
      ))}
    </div>
  );
}
