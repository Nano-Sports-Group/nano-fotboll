"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "athopia.draft:";
const SAVE_DEBOUNCE_MS = 400;
/** Ett utkast som legat kvar en vecka är bortglömt, inte påbörjat. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  value: string;
  at: number;
}

/**
 * Autosparat utkast i localStorage (mobil UX-regel 19).
 *
 * Returnerar `[value, setValue, clear]`. Utkastet läses synkront vid montering
 * så att fältet aldrig blinkar tomt först, och skrivs debouncat medan man
 * skriver. `clear()` anropas när innehållet skickats — annars möts användaren
 * av sitt eget redan publicerade inlägg nästa gång.
 */
export function useDraft(
  key: string,
  initial = "",
): [string, (next: string) => void, () => void] {
  const storageKey = PREFIX + key;
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stored;
      if (Date.now() - parsed.at > MAX_AGE_MS) {
        localStorage.removeItem(storageKey);
        return;
      }
      if (typeof parsed.value === "string" && parsed.value.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
        setValue(parsed.value);
      }
    } catch {
      // Trasig eller otillgänglig lagring får inte hindra att man skriver.
    }
  }, [storageKey]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      const save = () => {
        pending.current = null;
        try {
          if (next.trim().length === 0) localStorage.removeItem(storageKey);
          else
            localStorage.setItem(
              storageKey,
              JSON.stringify({ value: next, at: Date.now() } satisfies Stored),
            );
        } catch {
          // Se ovan.
        }
      };
      pending.current = save;
      timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setValue("");
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Se ovan.
    }
  }, [storageKey]);

  // Ett fönster som stängs mitt i en mening ska inte tappa meningen.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      // Skriv det som väntade på debouncen i stället för att kasta det.
      pending.current?.();
    };
  }, []);

  return [value, update, clear];
}
