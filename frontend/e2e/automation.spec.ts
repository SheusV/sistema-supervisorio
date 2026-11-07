import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function exportProject(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de processo", exact: true }).click();
});
test("edits existing links and renames tags without losing references", async ({ page }) => {
  const original = await exportProject(page);
  await page.locator("summary").filter({ hasText: "Ligações" }).click();
  await page.getByRole("button", { name: "Editar ligação 1", exact: true }).click();
  await page.getByLabel("Porta de saída", { exact: true }).selectOption("bottom");
  await page.getByLabel("Tipo da ligação", { exact: true }).selectOption("signal");
  await page.getByRole("button", { name: "Salvar ligação", exact: true }).click();
  let project = await exportProject(page);
  expect(project.connections).toHaveLength(4);
  expect(project.connections[0]).toMatchObject({ id: original.connections[0].id, fromPort: "bottom", kind: "signal" });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).connections).toEqual(original.connections);
  await page.locator("summary").filter({ hasText: "Tags do projeto" }).click();
  await page.getByRole("button", { name: "Editar tag LINHA.HABILITADA", exact: true }).click();
  await page.getByLabel("Nome da tag", { exact: true }).fill("BOMBA.RUN");
  await page.getByRole("button", { name: "Salvar tag", exact: true }).click();
  project = await exportProject(page);
  expect(project.simulation.enableTag).toBe("BOMBA.RUN");
  expect(project.connections[0].binding).toBe("BOMBA.RUN");
  expect(project.components.find((c: {id: string}) => c.id === "pump").binding).toBe("BOMBA.RUN");
  await page.locator("summary").filter({ hasText: "Simulação automática" }).click();
  await page.getByLabel("Taxa de entrada", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Salvar regra", exact: true }).click();
  expect((await exportProject(page)).simulation.fillRate).toBe(8);
  await page.getByRole("button", { name: "Excluir tag BOMBA.RUN", exact: true }).click();
  expect((await exportProject(page)).simulation).toBeUndefined();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).simulation.enableTag).toBe("BOMBA.RUN");
});
test("Java advances the level, pauses, drains and stops on connection failure", async ({ page }) => {
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const level = page.getByLabel("Valor de TANQUE.NIVEL", { exact: true });
  await expect(level).toHaveText("35 %");
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("true");
  await page.getByRole("button", { name: "Iniciar simulação automática", exact: true }).click();
  await expect.poll(async () => parseFloat((await level.textContent())!)).toBeGreaterThan(35);
  await page.getByRole("button", { name: "Pausar simulação automática", exact: true }).click();
  const paused = await level.textContent();
  await page.waitForTimeout(1300);
  await expect(level).toHaveText(paused!);
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("false");
  await page.getByRole("button", { name: "Iniciar simulação automática", exact: true }).click();
  await expect.poll(async () => parseFloat((await level.textContent())!)).toBeLessThan(parseFloat(paused!));
  await page.route("**/api/simulation/evaluate", route => route.abort());
  await expect(level).toHaveText("Indisponível");
  await expect(page.getByRole("button", { name: "Iniciar simulação automática", exact: true })).toBeDisabled();
  await page.unroute("**/api/simulation/evaluate");
  await page.getByRole("button", { name: "Reconectar simulação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Iniciar simulação automática", exact: true })).toBeEnabled();
  await page.screenshot({ path: "../docs/screenshots/simulacao-automatica.png", fullPage: true });
});
