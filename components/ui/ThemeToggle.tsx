"use client";

import { useTheme } from "next-themes";
import { useHydrated } from "@/hooks/useHydrated";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHydrated();

  if (!mounted) {
    return <div className="w-11 h-6 rounded-full bg-black/10 dark:bg-white/10 shrink-0" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Byt till ljust läge" : "Byt till mörkt läge"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      // Pillen är 24px hög visuellt; after-pseudot sträcker träffytan till 44px (HIG).
      className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
        after:absolute after:-inset-y-[10px] after:inset-x-0 after:content-['']
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background
        bg-black/10 dark:bg-white/10
        hover:bg-black/15 dark:hover:bg-white/15
        transition-colors duration-150"
    >
      {/* Track fill — animates width from left */}
      <span
        aria-hidden
        className={`
          absolute inset-0 rounded-full bg-pitch/20
          transition-opacity duration-[150ms]
          ${isDark ? "opacity-100" : "opacity-0"}
        `}
      />

      {/* Thumb */}
      <span
        aria-hidden
        className={`
          relative z-10 flex h-5 w-5 items-center justify-center rounded-full shadow-sm
          bg-white dark:bg-zinc-900
          transition-transform duration-[150ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]
          ${isDark ? "translate-x-[22px]" : "translate-x-[2px]"}
        `}
      >
        {/* Sun icon */}
        <svg
          className={`absolute h-3 w-3 transition-opacity duration-100 ${isDark ? "opacity-0" : "opacity-60"}`}
          fill="none"
          viewBox="0 0 16 16"
          aria-hidden
        >
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        {/* Moon icon */}
        <svg
          className={`absolute h-3 w-3 transition-opacity duration-100 ${isDark ? "opacity-60" : "opacity-0"}`}
          fill="none"
          viewBox="0 0 16 16"
          aria-hidden
        >
          <path
            d="M13.5 9.5A6 6 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
