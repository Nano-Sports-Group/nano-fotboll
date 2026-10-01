import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Vakt för mobil UX-regel 15: aldrig en tom skärm medan data hämtas.
 *
 * Varje route-segment under app/(app) som har en page.tsx måste ha en
 * loading.tsx, så att Next strömmar ett skelett i stället för att hålla
 * navigeringen och visa ingenting. Undantagen nedan är rena textsidor: de
 * hämtar ingenting, så ett skelett där hade bara blinkat till i onödan.
 */
const STATISKA_UNDANTAG = new Set(["ai-transparens", "anvandarvillkor", "integritetspolicy", "om-oss"]);

const APP_DIR = path.join("app", "(app)");

function segmentsWithPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(path.join(full, "page.tsx"))) {
      acc.push(path.relative(APP_DIR, full).split(path.sep).join("/"));
    }
    segmentsWithPages(full, acc);
  }
  return acc;
}

test("varje datahämtande route-segment har en loading.tsx", () => {
  const segments = segmentsWithPages(APP_DIR);
  // Sanity: hittar vi inga segment alls är testet självt trasigt, inte koden.
  assert.ok(segments.length > 20, `hittade bara ${segments.length} segment — trasig sökväg?`);

  const saknas = segments.filter(
    (segment) =>
      !STATISKA_UNDANTAG.has(segment) &&
      !existsSync(path.join(APP_DIR, segment, "loading.tsx")),
  );

  assert.deepEqual(
    saknas,
    [],
    `Dessa segment visar en tom skärm under laddning. Lägg till loading.tsx ` +
      `(använd components/ui/PageSkeleton) eller motivera ett undantag här: ${saknas.join(", ")}`,
  );
});

test("undantagslistan innehåller inga döda poster", () => {
  for (const segment of STATISKA_UNDANTAG) {
    assert.ok(
      existsSync(path.join(APP_DIR, segment, "page.tsx")),
      `Undantaget "${segment}" pekar på en route som inte finns — städa listan`,
    );
  }
});
