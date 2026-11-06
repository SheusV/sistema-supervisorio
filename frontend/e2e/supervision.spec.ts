import { test, expect } from "@playwright/test";

test("receives real backend updates, navigates, and fits a mobile viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  const initial = await page.getByTestId("level-value").textContent();
  await expect(page.getByTestId("level-value")).not.toHaveText(initial!);
  await expect(page.getByText("◉ SIMULAÇÃO")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "../docs/screenshots/desktop-java-live.png", fullPage: true });
  await page.getByRole("button", { name: "Tags" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByText("Primeiros passos")).toBeVisible();
  await page.getByRole("button", { name: "Supervisão" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("level-value")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("recovers the real Java stream after a transport interruption", async ({ page }) => {
  let firstStream: import("@playwright/test").WebSocketRoute | undefined;
  let connections = 0;
  await page.routeWebSocket("**/ws/tags", stream => {
    connections++;
    stream.connectToServer();
    firstStream = stream;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await firstStream!.close();
  await expect(page.getByTestId("level-value")).toContainText("—");
  await expect(page.getByRole("status")).toHaveText("Conectado", { timeout: 15000 });
  expect(connections).toBeGreaterThan(1);
  await expect(page.getByTestId("level-value")).not.toContainText("—");
});
