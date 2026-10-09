"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

// Porterad känsla, inte kod, från iOS OnboardingView steg 3 / 60fps
// gleam-confetti-pop-animation (nano-components/patterns/onboarding/README.md §2b).
// Web har redan `motion` i package.json — återanvänder den i stället för ett nytt
// confetti-bibliotek. Spelas en gång när lagets riktiga förhandsvisning har laddats,
// web-flödets motsvarighet till "nu är det ditt lag".

const COLORS = ["var(--color-pitch)", "#F5C518", "#5FA8DC", "#FFFFFF", "#4ED17A"];

interface Piece {
  id: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
  delay: number;
  width: number;
  height: number;
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 160;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 40,
      rotate: (Math.random() - 0.5) * 540,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.08,
      width: 5 + Math.random() * 4,
      height: 9 + Math.random() * 6,
    };
  });
}

export function ConfettiBurst() {
  const pieces = useMemo(() => makePieces(32), []);
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 h-0 w-0" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 1.1, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
