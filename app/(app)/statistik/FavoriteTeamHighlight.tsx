"use client";

import { useEffect } from "react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";

/**
 * Monteras i statistik-sidan och highlightar användarens lag i tabellen.
 * DOM-query eftersom tabellen är serverrenderad.
 *
 * Matchningen är exakt. Den var tidigare suddig — slugen delades på bindestreck
 * och varje ord jämfördes med `includes()`. Följden: valde du Elfsborg
 * ("if-elfsborg") matchade ordet "if" även Djurgårdens IF och IFK Göteborg, så
 * tre rader markerades och sidan scrollade till fel lag. Radens slug kom
 * dessutom från en slugify av namnet och behöll å/ä/ö, så den exakta
 * jämförelsen kunde aldrig träffa Djurgården — bara den suddiga.
 *
 * Raden bär nu `entities.slug`, samma sträng som `useFavoriteTeam` returnerar.
 */
export function FavoriteTeamHighlight() {
  const { slug, isLoaded } = useFavoriteTeam();

  useEffect(() => {
    if (!isLoaded || !slug) return;

    const rows = document.querySelectorAll<HTMLTableRowElement>("tbody tr[data-team-slug]");
    rows.forEach((row) => {
      if (row.dataset["teamSlug"] === slug) {
        row.style.setProperty("background-color", "color-mix(in srgb, var(--pitch) 8%, transparent)");
        row.style.setProperty("box-shadow", `inset 2px 0 0 var(--color-pitch)`);
        // Scrolla till raden om den inte är synlig
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }, [slug, isLoaded]);

  return null;
}
