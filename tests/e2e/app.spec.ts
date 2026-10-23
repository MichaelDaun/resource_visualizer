import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("map shows the basemap and actors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator(".map-canvas canvas")).toBeVisible();
  await expect(page.locator('.map-svg .node[data-id="region-kalmar"]')).toHaveCount(1);
  // Initiatives have no place of their own; they appear only around a selected actor.
  await expect(page.locator(".map-svg .node-initiative")).toHaveCount(0);
  await expect(page.locator(".map-svg .edge")).toHaveCount(0);
  await expect(page.locator(".status-line")).toContainText("65 poster");
  // The accurate municipality shapes load after the first render.
  await expect(page.locator(".map-svg.has-detail")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("selecting an actor shows its initiatives and relations", async ({ page }) => {
  await page.goto("/");
  await page.locator('.map-svg .node[data-id="additive-tech-center"] .glyph').click();
  await expect(page.locator("#details h2")).toHaveText("Additivt Teknikcenter i Hultsfred");
  await expect(page.locator('.map-svg .node[data-id="atc-services"]')).toHaveCount(1);
  await expect(page.locator(".map-svg .edge").first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-svg .node-initiative")).toHaveCount(0);
});

test("selecting a node opens details with its relations", async ({ page }) => {
  await page.goto("/#/karta/dika");
  const details = page.locator("#details");
  await expect(details).toBeVisible();
  await expect(details.locator("h2")).toHaveText("DiKa");
  await expect(details.locator(".flow")).toContainText("Tillväxtverket");
  await details.getByRole("button", { name: /Linnéuniversitetet/ }).first().click();
  await expect(details.locator("h2")).toHaveText("Linnéuniversitetet");
  await expect(page).toHaveURL(/#\/karta\/linnaeus-university$/);
  await details.getByRole("button", { name: "Stäng" }).click();
  await expect(details).toBeHidden();
});

test("search selects a node", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("almi");
  await page.keyboard.press("Enter");
  await expect(page.locator("#details h2")).toHaveText("Almi Kalmar län");
});

test("network view renders and filters apply", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Nätverk", exact: true }).click();
  // Generous timeout: on CI runners the WebGL map shares a slow software renderer with the layout.
  await expect(page.locator(".network-svg .node")).toHaveCount(65, { timeout: 15_000 });
  if (isMobile) await page.getByRole("button", { name: "Urval och teckenförklaring" }).click();
  await page.locator('.filter-row label:has(input[data-value="service"])').click();
  await expect(page.locator(".network-svg .node")).toHaveCount(48);
  await expect(page.locator(".status-line")).toContainText("48 av 65");
  expect(errors).toEqual([]);
});

test("clicking a municipality shows what is offered there", async ({ page, isMobile }) => {
  test.skip(isMobile, "Municipalities are small targets on phones; covered on desktop.");
  await page.goto("/");
  await expect(page.locator(".map-svg.has-detail")).toHaveCount(1);
  const details = page.locator("#details");
  // Click the map a little south of the actors in Hultsfred. The municipality shapes are
  // processed off the main thread, so the first click can come too early; retry until it lands.
  await expect(async () => {
    const a = (await page.locator('.map-svg .node[data-id="additive-tech-center"] .glyph').boundingBox())!;
    const b = (await page.locator('.map-svg .node[data-id="hultsfred-municipality"] .glyph').boundingBox())!;
    await page.mouse.click((a.x + b.x) / 2 + a.width / 2, Math.max(a.y, b.y) + 40);
    await expect(details.locator("h2")).toHaveText("Hultsfreds kommun", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(details).toContainText("Additivt Teknikcenter i Hultsfred");
  await expect(page).toHaveURL(/#\/karta\/plats\/hultsfred$/);
  await details.getByRole("button", { name: /Additivt Teknikcenter/ }).click();
  await expect(details.locator("h2")).toHaveText("Additivt Teknikcenter i Hultsfred");
  await details.getByRole("button", { name: /Hultsfreds kommun/ }).first().click();
  await expect(details.locator("h2")).toHaveText("Hultsfreds kommun");
});

test("search finds places", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("öland");
  await page.keyboard.press("Enter");
  await expect(page.locator("#details h2")).toHaveText("Öland");
  await expect(page.locator("#details")).toContainText("Borgholm");
});

test("county filter hides the other county", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Urval och teckenförklaring" }).click();
  await page.locator('.filter-row label:has(input[data-key="counties"][data-value="07"])').click();
  await expect(page.locator('.map-svg .node[data-id="region-kronoberg"]')).toHaveCount(0);
  await expect(page.locator('.map-svg .node[data-id="region-kalmar"]')).toHaveCount(1);
  // National actors stay visible whatever the county.
  await expect(page.locator('.map-svg .node[data-id="vinnova"]')).toHaveCount(1);
});

test("every theme renders without errors", async ({ page }) => {
  const errors = collectErrors(page);
  for (const theme of ["midsommar", "natt"]) {
    await page.goto(`/?tema=${theme}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".map-svg .node").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("'bara' shows a single value", async ({ page, isMobile }) => {
  test.skip(isMobile, "The shortcut appears on hover.");
  await page.goto("/");
  const row = page.locator('.filter-row:has(input[data-value="programme"])');
  await row.hover();
  await row.getByRole("button", { name: "bara" }).click();
  await expect(page.locator(".status-line")).toContainText("av 65");
  // Only actors taking part in a programme stay on the map.
  await expect(page.locator('.map-svg .node[data-id="kalmar-science-park"]')).toHaveCount(1);
  await expect(page.locator('.map-svg .node[data-id="almi-kalmar"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Återställ" }).click();
  await expect(page.locator(".status-line")).toContainText("65 poster");
});

test("the finder suggests offers for a company", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/#/hitta");
  await expect(page.getByRole("heading", { name: "Hitta stöd för ditt företag" })).toBeVisible();
  await page.selectOption("#finder-where", "hultsfred");
  await page.locator('.need:has(input[value="innovation"])').click();
  const offers = page.locator(".offer");
  await expect(offers.first()).toBeVisible();
  await expect(page.locator(".finder-results")).toContainText("3D-printing och uppdragsutbildning");
  await expect(page.locator(".finder-results")).not.toContainText("Inkubatorprogram"); // Kronoberg only
  await page.locator('[data-show="atc-services"]').click();
  await expect(page).toHaveURL(/#\/karta\/atc-services$/);
  await expect(page.locator("#details h2")).toHaveText("3D-printing och uppdragsutbildning");
  expect(errors).toEqual([]);
});
