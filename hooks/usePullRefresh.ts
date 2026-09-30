"use client";

import { useEffect, useRef } from "react";
import {
  PULL_REFRESH_EVENT,
  type PullRefreshDetail,
} from "@/components/layout/PullToRefreshShell";

/**
 * Låter en klientyta med egen data hänga med på app-shellens pull-to-refresh
 * (mobil UX-regel 1) i stället för att bygga en andra touch-hanterare som
 * konkurrerar om samma gest.
 *
 * Indikatorn i shellen snurrar tills promisen som `handler` returnerar är klar.
 */
export function usePullRefresh(handler: () => Promise<unknown>): void {
  const ref = useRef(handler);
  // Senaste handlern utan att registrera om lyssnaren — skrivs efter commit, aldrig under render.
  useEffect(() => {
    ref.current = handler;
  }, [handler]);

  useEffect(() => {
    function onRefresh(event: Event) {
      const detail = (event as CustomEvent<PullRefreshDetail>).detail;
      detail?.waitFor(ref.current());
    }
    window.addEventListener(PULL_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PULL_REFRESH_EVENT, onRefresh);
  }, []);
}
