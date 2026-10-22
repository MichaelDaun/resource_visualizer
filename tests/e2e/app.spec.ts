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
  await expect(page.locator(".map-svg .region-home")).toHaveCount(1);
  await expect(page.locator('.map-svg .node[data-id="dika"]')).toHaveCount(1);
  await expect(page.locator(".status-line")).toContainText("17 av 17");
  expect(errors).toEqual([]);
});

test("selecting a node opens details with its relations", async ({ page }) => {
  await page.goto("/#/karta/dika");
  const details = page.locator("#details");
  await expect(details).toBeVisible();
  await expect(details.locator("h2")).toHaveText("DIKA");
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
  await expect(page.locator(".network-svg .node")).toHaveCount(17);
  if (isMobile) await page.getByRole("button", { name: "Filter och förklaring" }).click();
  await page.locator('.filter-chip[data-value="service"]').click();
  await expect(page.locator(".network-svg .node")).toHaveCount(15);
  expect(errors).toEqual([]);
});
