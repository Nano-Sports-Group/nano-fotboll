"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { rubberband } from "@/lib/gesture";

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;

/**
 * Klientytor som håller egen data prenumererar på den här händelsen i stället för
 * att bygga en andra pull-gest. `waitFor` gör att indikatorn snurrar tills även
 * deras fetch är klar — annars slutar den snurra medan flödet fortfarande är gammalt.
 */
export const PULL_REFRESH_EVENT = "athopia:pull-refresh";

export interface PullRefreshDetail {
  waitFor: (promise: Promise<unknown>) => void;
}

/**
 * Pull-to-refresh för hela app-shellen (mobil UX-regel 1).
 *
 * Medvetet utan `transform` på innehållet och utan `overflow: hidden` på någon
 * förälder: båda skulle bryta produkten. En transform gör wrappern till
 * containing block för varje `position: fixed`-barn (modaler, docken), och
 * `overflow: hidden` gör den till scroll-container så att alla sticky headers
 * slutar fastna. Telefonen rubber-bandar redan sidan själv — vi lägger bara
 * indikatorn ovanpå, fixerad, så att gesten blir läsbar.
 */
export function PullToRefreshShell() {
  const router = useRouter();
  const pathname = usePathname();
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refreshing = waiting || isPending;

  const onTouchStart = useCallback((event: TouchEvent) => {
    // Bara från absoluta scrolltoppen, annars kapar vi vanlig scroll.
    if (window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = event.touches[0]?.clientY ?? null;
  }, []);

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      if (startY.current === null) return;
      const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
      // Gummiband med progressiv resistans i stället för linjär ×0.5: ett hårt
      // tak läser som "fruset", motstånd som växer med draget läser som
      // "responsivt, men det finns inget mer här". Viewporthöjden är
      // dimensionen — den ger samma känsla som förut vid tröskeln (144 px
      // drag → 72 px) och styvnar progressivt först därefter.
      setPull(Math.min(MAX_PULL, rubberband(delta, window.innerHeight || 800)));
    },
    [],
  );

  const onTouchEnd = useCallback(() => {
    const pulled = pull;
    startY.current = null;
    setPull(0);
    if (pulled < PULL_THRESHOLD || refreshing) return;

    const pending: Promise<unknown>[] = [];
    const detail: PullRefreshDetail = {
      waitFor: (promise) => pending.push(promise),
    };
    window.dispatchEvent(new CustomEvent(PULL_REFRESH_EVENT, { detail }));

    // Serverkomponenter uppdateras via router.refresh(); isPending följer den.
    startTransition(() => router.refresh());

    if (pending.length > 0) {
      setWaiting(true);
      void Promise.allSettled(pending).finally(() => setWaiting(false));
    }
  }, [pull, refreshing, router]);

  useEffect(() => {
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // En ny route ärver aldrig en halvdragen gest.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setPull(0);
  }
  useEffect(() => {
    startY.current = null;
  }, [pathname]);

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const visible = refreshing || pull > 4;

  return (
    <div
      data-pull-to-refresh
      aria-hidden={!refreshing}
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center md:hidden"
      style={{
        transform: `translateY(${refreshing ? 16 : Math.max(0, pull - 8)}px)`,
        opacity: visible ? (refreshing ? 1 : progress) : 0,
        // Härlett ur pull, inte läst ur startY-refen: en ref som läses under
        // render kan vara en render gammal, och React garanterar inte att den
        // här raden körs om när refen ändras. Under pågående drag är pull > 0
        // och rörelsen ska vara 1:1 utan transition; vid släpp nollas pull och
        // återgången får glida tillbaka.
        transition:
          pull === 0 || refreshing
            ? "transform 240ms ease, opacity 240ms ease"
            : "none",
      }}
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur">
        <Loader2
          className={cn("size-4 text-muted-foreground", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </span>
      <span className="sr-only">{refreshing ? "Uppdaterar" : ""}</span>
    </div>
  );
}
