"use client";

import { vertical } from "@/lib/vertical";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "motion/react";

/* Tumzon-CTA: fast docka i nedre delen av skärmen på mobil (tab bar-inspirerad).
   Visas först när hero scrollats förbi, respekterar safe-area (home-indikatorn). */

export function MobileDock() {
  const [visible, setVisible] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => setVisible(y > 560));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 34 }}
          className="fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),16px)] z-40 md:hidden"
        >
          <div className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-[#111312]/90 p-2 pl-5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="min-w-0">
              <p className="font-heading text-base tracking-widest text-white">{vertical.wordmark}</p>
              <p className="truncate text-xs text-white/55">Gratis · inget kreditkort</p>
            </div>
            <Link
              href="/onboarding"
              className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-pitch px-5 text-[15px] font-bold text-white active:scale-[0.96]"
            >
              Börja gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
