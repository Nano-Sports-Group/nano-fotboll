"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VISIT_KEY = "athopia_visit_count";
const PUSH_PROMPTED_KEY = "athopia_push_prompted";
const PUSH_SUBSCRIBED_KEY = "athopia_push_subscribed";

// ── Service worker registration ───────────────────────────────────────────────

export function useServiceWorker() {
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => setSwReady(true))
      .catch(() => {});
  }, []);

  return { swReady };
}

// ── Visit counter (localStorage) ─────────────────────────────────────────────

export function useVisitCount(): number {
  const [count, setCount] = useState(0);
  const incremented = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || incremented.current) return;
    incremented.current = true;
    const raw = parseInt(window.localStorage.getItem(VISIT_KEY) ?? "0", 10);
    const next = raw + 1;
    window.localStorage.setItem(VISIT_KEY, String(next));
    setCount(next);
  }, []);

  return count;
}

// ── Push permission ───────────────────────────────────────────────────────────

/**
 * `unconfigured` = NEXT_PUBLIC_VAPID_PUBLIC_KEY saknas i miljön.
 *
 * Utan den kan `pushManager.subscribe` aldrig köras, men felet såg tidigare ut
 * precis som ett nekande: hooken returnerade `false` innan behörigheten ens
 * efterfrågades, och användaren fick "Försök igen" i all evighet. Det är
 * skillnaden mellan en miljövariabel som ska sättas och ett fel i koden — och
 * den skillnaden ska synas, inte gissas. Databasen har noll prenumerationer
 * sedan starten, så det här är precis den diagnos som saknats.
 */
export interface PushPermissionState {
  status: NotificationPermission | "unsupported" | "unconfigured";
  isSubscribed: boolean;
  requestPermission: (teamIds?: string[]) => Promise<boolean>;
}

export function usePushPermission(): PushPermissionState {
  const [status, setStatus] = useState<NotificationPermission | "unsupported" | "unconfigured">("default");
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission);
    const subscribed = window.localStorage.getItem(PUSH_SUBSCRIBED_KEY) === "1";
    setIsSubscribed(subscribed);
  }, []);

  const requestPermission = useCallback(async (teamIds: string[] = []): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (!("serviceWorker" in navigator)) return false;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      // Tyst retur här gjorde ett konfigurationsfel omöjligt att skilja från
      // ett nekande. Nu säger UI:t vad som faktiskt är fel.
      setStatus("unconfigured");
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setStatus(permission);
      window.localStorage.setItem(PUSH_PROMPTED_KEY, "1");

      if (permission !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Spara subscription i Supabase via API
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription, teamIds }),
      });

      window.localStorage.setItem(PUSH_SUBSCRIBED_KEY, "1");
      setIsSubscribed(true);
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "push_opt_in" }),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }, []);

  return { status, isSubscribed, requestPermission };
}

// ── beforeinstallprompt ───────────────────────────────────────────────────────

export interface PwaInstallState {
  canInstall: boolean;
  triggerInstall: () => Promise<void>;
  dismissInstall: () => void;
}

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (deferredPrompt as any).prompt();
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
  }, []);

  return { canInstall: !!deferredPrompt && !dismissed, triggerInstall, dismissInstall };
}

// ── Hjälpfunktion: VAPID-key konvertering ────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const array = Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  return array.buffer as ArrayBuffer;
}

export { PUSH_PROMPTED_KEY };
