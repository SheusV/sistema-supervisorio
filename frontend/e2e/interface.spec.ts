import { test, expect } from "@playwright/test";
import { frame } from "../src/test/fixture";

test("interface with controlled test frames: updates, disconnects and remains responsive", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let stream: Parameters<Parameters<typeof page.routeWebSocket>[1]>[0];
  await page.routeWebSocket("**/ws/tags", (ws) => {
    stream = ws;
    ws.send(JSON.stringify(frame()));
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await expect(page.getByTestId("level-value")).toContainText("42.0");
  stream!.send(JSON.stringify(frame(2, 68)));
  await expect(page.getByTestId("level-value")).toContainText("68.0");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../docs/screenshots/desktop-test-data.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByText("Primeiros passos")).toBeVisible();
  await page.getByRole("button", { name: "Supervisão", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/mobile-test-data.png",
    fullPage: true,
  });
  stream!.close();
  await expect(page.getByRole("status")).toHaveText("Sem conexão");
  await expect(page.getByTestId("level-value")).toContainText("—");
});
