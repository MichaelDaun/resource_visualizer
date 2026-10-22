import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("map shows the basemap and nodes", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator(".map-svg .home-county")).toHaveCount(2);
  await expect(page.locator('.map-svg .node[data-id="dika"]')).toHaveCount(1);
  await expect(page.locator(".status-line")).toContainText("29 av 29");
  expect(errors).toEqual([]);
});

test("selecting a node opens details with its relations", async ({ page }) => {
  await page.goto("/#/karta/dika");
  const details = page.locator("#details");
  await expect(details).toBeVisible();
  await expect(details.locator("h2")).toHaveText("DiKa");
  await details.getByRole("button", { name: /Linnéuniversitetet/ }).click();
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
  await expect(page.locator(".network-svg .node")).toHaveCount(29);
  if (isMobile) await page.getByRole("button", { name: "Filter och förklaring" }).click();
  await page.locator('.filter-chip[data-value="service"]').click();
  await expect(page.locator(".network-svg .node")).toHaveCount(26);
  expect(errors).toEqual([]);
});

test("clicking a municipality shows what is offered there", async ({ page, isMobile }) => {
  test.skip(isMobile, "Municipalities are small targets on phones; covered on desktop.");
  await page.goto("/");
  await page.locator('.municipality[data-code="0860"]').dispatchEvent("click");
  const details = page.locator("#details");
  await expect(details.locator("h2")).toHaveText("Hultsfreds kommun");
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
  await expect(page.locator("#details")).toContainText("Borgholms kommun");
});

test("county filter hides the other county", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Filter och förklaring" }).click();
  await page.locator('.filter-chip[data-key="counties"][data-value="07"]').click();
  await expect(page.locator('.map-svg .node[data-id="region-kronoberg"]')).toHaveCount(0);
  await expect(page.locator('.map-svg .node[data-id="region-kalmar"]')).toHaveCount(1);
  // National actors stay visible whatever the county.
  await expect(page.locator('.map-svg .node[data-id="vinnova"]')).toHaveCount(1);
});

test("every theme renders without errors", async ({ page }) => {
  const errors = collectErrors(page);
  for (const theme of ["fjord", "midsommar", "natt"]) {
    await page.goto(`/?tema=${theme}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".map-svg .node").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
