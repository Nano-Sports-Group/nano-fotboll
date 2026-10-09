"use client";

import { useEffect, useState } from "react";

// Stiliserad 3D-lutad planhalva i lagens riktiga färger — 60fps x-nfl-games-
// tab-switch-interaction (nano-components/patterns/matchsida-statistik/README.md
// §2a.1). Hampus 2026-10-09, med X NFL-skärmdump som referens: "Kan vi göra en
// sånhär... för varje match?" Egen grafik, ingen kopierad logga/copy. CSS 3D
// transform (perspective + rotateX), ingen canvas/webgl — samma tunga-lätt
// princip som övriga motion-tillägg denna session.

function shortCode(name: string): string {
  const folded = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return folded.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
}

export function PerspectiveField({
  homeName,
  awayName,
  homeColor,
  awayColor,
}: {
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
}) {
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAppeared(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex justify-center py-2" style={{ perspective: "900px" }} aria-hidden>
      <div
        className="flex overflow-hidden rounded-md border border-white/25 transition-all duration-500 ease-out motion-reduce:transition-none"
        style={{
          width: 290,
          height: 110,
          transform: `rotateX(56deg) scale(${appeared ? 1 : 0.85})`,
          opacity: appeared ? 1 : 0,
        }}
      >
        <div className="flex w-[46px] shrink-0 items-center justify-center" style={{ backgroundColor: homeColor }}>
          <span className="font-mono text-[15px] font-black text-white/85">{shortCode(homeName)}</span>
        </div>
        <div className="relative flex-1" style={{ background: "linear-gradient(180deg, #1c5c26, #266e31)" }}>
          <div className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-[42px] w-[42px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/40" />
        </div>
        <div className="flex w-[46px] shrink-0 items-center justify-center" style={{ backgroundColor: awayColor }}>
          <span className="font-mono text-[15px] font-black text-white/85">{shortCode(awayName)}</span>
        </div>
      </div>
    </div>
  );
}
