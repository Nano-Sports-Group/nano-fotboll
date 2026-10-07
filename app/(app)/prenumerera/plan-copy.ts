/**
 * Elite-planens innehåll, delat mellan prissidan (klientkomponent) och /konto/uppgradera (servern).
 * Ligger i en egen modul: en konstant exporterad ur en "use client"-fil blir en klientreferens när en
 * servercomponent importerar den, inte arrayen.
 */
export const ELITE_FEATURES = [
  "Allt i PRO",
  "Cross-source clustering",
  "Vad som spelar roll idag för ditt lag",
  "Trend detection (eskalerande rykten)",
];
