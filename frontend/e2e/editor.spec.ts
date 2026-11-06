import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { frame } from "../src/test/fixture";

test("edits, exports and reopens the same screen with bindings and layer order", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws/tags", (stream) =>
    stream.send(JSON.stringify(frame())),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.getByLabel("Editor de telas")).toBeVisible();
  await page.getByRole("button", { name: "Tanque", exact: true }).click();
  await expect(page.getByLabel("Identificação", { exact: true })).toHaveValue(
    "Tanque",
  );
  await page.getByLabel("Identificação", { exact: true }).fill("TQ-002");
  await page.getByLabel("X", { exact: true }).click();
  await page.getByLabel("X", { exact: true }).fill("340");
  await page.getByLabel("Y", { exact: true }).click();
  await page.getByLabel("Y", { exact: true }).fill("220");
  await page.getByLabel("Largura", { exact: true }).click();
  await page.getByLabel("Largura", { exact: true }).fill("230");
  await page.getByLabel("Rotação", { exact: true }).click();
  await page.getByLabel("Rotação", { exact: true }).fill("30");
  await page.getByLabel("Tag vinculada").click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.getByRole('button', { name: 'Para trás', exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar projeto" }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.components).toHaveLength(5);
  expect(data.components[3]).toMatchObject({
    label: "TQ-002",
    x: 340,
    y: 220,
    width: 230,
    angle: 30,
    binding: "TQ001.LEVEL",
  });
  await page.getByRole("button", { name: "Excluir componente" }).click();
  await page
    .getByLabel("Arquivo de projeto")
    .setInputFiles({
      name: "projeto.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page
    .getByRole("button", { name: "Tanque TQ-002", exact: true })
    .click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("340");
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.screenshot({
    path: "../docs/screenshots/editor-v0.2.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tanque", exact: true, includeHidden: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Valores em operação")).toContainText(
    "TQ-002: 42 %",
  );
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tanque TQ-002", exact: true }),
  ).toBeVisible();
});

test("rejects unsafe project fields without replacing the current screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByLabel("Arquivo de projeto")
    .setInputFiles({
      name: "malformed.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"schemaVersion":1,"src":"https://example.com/active.svg"}',
      ),
    });
  await expect(
    page.getByText("O projeto contém campos ausentes ou não suportados."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tanque TQ-001", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("moves equipment with the mouse and operates using the Java stream", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Tanque TQ-001", exact: true })
    .click();
  const scale =
    Number(await page.getByLabel("Zoom", { exact: true }).inputValue()) / 100;
  const area = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(area.x + 600 * scale, area.y + 320 * scale);
  await page.mouse.down();
  await page.mouse.move(area.x + 690 * scale, area.y + 370 * scale, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("600");
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue("240");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("510");
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const readings = page.getByLabel("Valores em operação");
  await expect(readings).not.toContainText("Indisponível");
  const initial = await readings.textContent();
  await expect(readings).not.toHaveText(initial!);
  await page.screenshot({
    path: "../docs/screenshots/editor-operacao-java.png",
    fullPage: true,
  });
});
