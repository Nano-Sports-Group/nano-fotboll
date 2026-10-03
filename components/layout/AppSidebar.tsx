"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Sidebar, DesktopSidebar, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  BOTTOM_NAV_ITEMS,
  SIDEBAR_NAV_ITEMS,
  isNavActive,
  type NavItem as NavItemConfig,
} from "@/lib/nav";

function NavItem({ href, label, icon: Icon, exact }: NavItemConfig) {
  const { open, animate } = useSidebar();
  const pathname = usePathname();
  const isActive = isNavActive({ href, exact }, pathname);

  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors duration-150",
        isActive
          ? "text-pitch-ink bg-pitch/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          isActive ? "text-pitch-ink" : "text-foreground/60",
        )}
      />
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="whitespace-nowrap font-medium"
      >
        {label}
      </motion.span>
    </Link>
  );
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const primaryHrefs = new Set(BOTTOM_NAV_ITEMS.map((i) => i.href));
  const primary = SIDEBAR_NAV_ITEMS.filter((i) => primaryHrefs.has(i.href));
  const extras = SIDEBAR_NAV_ITEMS.filter((i) => !primaryHrefs.has(i.href));

  return (
    <div className="sticky top-12 hidden h-[calc(100vh-3rem)] shrink-0 self-start md:block">
      <Sidebar open={open} setOpen={setOpen}>
        <DesktopSidebar className="h-full !bg-background border-r border-border/50 py-4 flex-col gap-0.5">
          {primary.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          {extras.length > 0 ? (
            <>
              <div className="my-2 mx-2 border-t border-border/40" aria-hidden />
              {extras.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </>
          ) : null}
        </DesktopSidebar>
      </Sidebar>
    </div>
  );
}
