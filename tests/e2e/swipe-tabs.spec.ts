import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.skip(({ browserName }) => browserName !== "chromium", "CDP-touch finns bara i Chromium");

/**
 * Svep i sidled på en lagsektion = grannsektionen (SwipeTabs, Figma B · Hem).
 * Riktiga touch-händelser via CDP — Playwright saknar en färdig svepgest.
 */
async function swipe(page: Page, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  const { width } = page.viewportSize()!;
  const y = 420;
  const x0 = width / 2 - dx / 2;
  const at = (x: number) => [{ x, y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x0) });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x0 + (dx * i) / 6) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("svep vänster/höger byter lagsektion och kapseln följer med", async ({ page }) => {
  await page.goto("/lag/aik");
  // Gesten lyssnar först efter hydrering.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Lagsektioner" }).getByRole("link", { name: "Översikt" })).toHaveAttribute("aria-current", "page");

  // Räkna glidövergångarna: bytet ska animeras, inte bara hoppa.
  await page.evaluate(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const orig = document.startViewTransition?.bind(document);
    if (orig) document.startViewTransition = ((arg: never) => { w.__vt++; return orig(arg); }) as typeof document.startViewTransition;
  });

  await swipe(page, -200);
  await expect(page).toHaveURL(/\/lag\/aik\/nyheter$/);
  expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "Nyheter", exact: true }).first()).toHaveAttribute("aria-current", "page");

  await page.waitForTimeout(600); // övergången (320 ms) är klar innan nästa svep
  await swipe(page, 200);
  await expect(page).toHaveURL(/\/lag\/aik$/);
});
