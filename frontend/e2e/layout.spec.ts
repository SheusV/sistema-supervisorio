import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const project = { schemaVersion: 1, name: "Organização", screen: { width: 1200, height: 720 }, components: [
  { id: "a", kind: "pump", label: "P-A", x: 100, y: 100, width: 160, height: 130, angle: 0, binding: "P001.RUNNING" },
  { id: "b", kind: "tank", label: "T-B", x: 400, y: 220, width: 180, height: 260, angle: 0, binding: "TQ001.LEVEL" },
  { id: "c", kind: "indicator", label: "I-C", x: 900, y: 400, width: 160, height: 130, angle: 0, binding: "TQ001.TEMPERATURE" },
] };
async function exported(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8")) as typeof project;
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole("button", { name: "Bomba P-A", exact: true })).toBeVisible();
});
test("aligns and distributes a selection, undoes once and reopens its JSON", async ({ page }) => {
  await page.getByRole("button", { name: "Bomba P-A", exact: true }).click();
  await page.getByRole("button", { name: "Tanque T-B", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 objetos selecionados", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Distribuir na horizontal", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Alinhar à esquerda", exact: true }).click();
  expect((await exported(page)).components.map(i => i.x)).toEqual([100, 100, 900]);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(project.components);
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await page.getByRole("button", { name: "Distribuir na horizontal", exact: true }).click();
  const result = await exported(page);
  expect(result.components.map(i => i.x)).toEqual([100, 490, 900]);
  await page.getByRole("button", { name: "Excluir selecionados", exact: true }).click();
  expect((await exported(page)).components).toHaveLength(0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(result.components);
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(result)) });
  expect((await exported(page)).components).toEqual(result.components);
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await page.screenshot({ path: "../docs/screenshots/editor-selecao-multipla.png", fullPage: true });
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alinhar à esquerda", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Propriedades do componente")).toBeHidden();
});
test("moves a multi-selection together on the canvas and preserves rotation", async ({ page }) => {
  const rotated = structuredClone(project); rotated.components[1].angle = 30;
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "rotated.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rotated)) });
  await page.getByRole("button", { name: "Bomba P-A", exact: true }).click();
  await page.getByRole("button", { name: "Tanque T-B", exact: true }).click({ modifiers: ["Shift"] });
  const scale = Number(await page.getByLabel("Zoom", { exact: true }).inputValue()) / 100;
  const area = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(area.x + 180 * scale, area.y + 165 * scale);
  await page.mouse.down();
  await page.mouse.move(area.x + 260 * scale, area.y + 225 * scale, { steps: 8 });
  await page.mouse.up();
  const result = await exported(page);
  expect(result.components[0]).toMatchObject({ x: 180, y: 160 });
  expect(result.components[1]).toMatchObject({ x: 480, y: 280, angle: 30, width: 180, height: 260 });
  expect(result.components[2]).toEqual(project.components[2]);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(rotated.components);
});
