import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openExample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo com várias telas" }).click();
}
async function documentOf(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}
async function checkpoint(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("nexo-operation-history");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("checkpoints").objectStore("checkpoints").get(JSON.stringify(["Linha de grãos", "FORNO.RUN"]));
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }));
}

test("manages screens with undo and preserves the complete project in JSON and library", async ({ page }) => {
  await openExample(page);
  const screen = page.getByLabel("Tela exibida", { exact: true });
  await screen.selectOption("drying");
  await page.getByRole("button", { name: "Duplicar tela", exact: true }).click();
  await page.getByLabel("Nome da tela exibida", { exact: true }).fill("Detalhe do forno");
  await page.getByRole("button", { name: "Renomear tela", exact: true }).click();
  const saved = await documentOf(page);
  expect(saved.additionalScreens).toHaveLength(3);
  expect(saved.components).toEqual(saved.additionalScreens.find((s: any) => s.id === "drying").components);
  await page.getByRole("button", { name: "Adicionar tela", exact: true }).click();
  expect((await documentOf(page)).components).toHaveLength(0);
  await page.getByRole("button", { name: "Excluir tela exibida", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(screen.locator("option")).toHaveCount(5);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(screen.locator("option")).toHaveCount(4);
  await page.getByRole("button", { name: "Nova tela", exact: true }).click();
  await expect(screen.locator("option")).toHaveCount(1);
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "screens.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)) });
  expect(await documentOf(page)).toEqual(saved);
  await page.getByText("Projetos salvos", { exact: true }).click();
  await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
  await expect(page.getByLabel("Projeto salvo", { exact: true })).toHaveValue(saved.name);
  await page.reload();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByText("Projetos salvos", { exact: true }).click();
  await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
  expect(await documentOf(page)).toEqual(saved);
});

test("updates shared bindings on inactive screens when a tag is renamed or deleted", async ({ page }) => {
  await openExample(page);
  await page.getByText("Tags do projeto", { exact: false }).first().click();
  await page.getByRole("button", { name: "Editar tag ESTEIRA.RUN", exact: true }).click();
  await page.getByLabel("Nome da tag", { exact: true }).fill("ET01.RUN");
  await page.getByRole("button", { name: "Salvar tag", exact: true }).click();
  const renamed = await documentOf(page);
  expect(JSON.stringify(renamed)).not.toContain('"ESTEIRA.RUN"');
  expect(renamed.additionalScreens.find((s: any) => s.id === "receiving").components.find((c: any) => c.id === "belt").binding).toBe("ET01.RUN");
  await page.getByRole("button", { name: "Excluir tag ET01.RUN", exact: true }).click();
  expect(JSON.stringify(await documentOf(page))).not.toContain('"ET01.RUN"');
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(await documentOf(page)).toEqual(renamed);
});

test("keeps drying active across screens and recovers the same batch from another view", async ({ page }) => {
  await openExample(page);
  const screen = page.getByLabel("Tela exibida", { exact: true });
  await screen.selectOption("receiving");
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const recovery = page.getByRole("region", { name: "Retomada da operação" });
  await expect(recovery.getByRole("status")).not.toHaveText("Consultando operação salva…");
  await page.getByLabel("Novo valor de SILO.MASSA").fill("60");
  await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  await expect.poll(async () => (await checkpoint(page))?.values["SILO.MASSA"]).toBe(60);
  for (const name of ["Alternar TRITURADOR.RUN", "Alternar FORNO.RUN", "Iniciar simulação automática"]) await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByLabel("Valor de SILO.MASSA", { exact: true })).toHaveText("0 kg");
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  const dryer = page.getByRole("region", { name: "Secagem dos grãos" });
  await dryer.getByLabel("Temperatura alvo (°C)").fill("25");
  await dryer.getByLabel("Tempo mínimo de secagem (s)").fill("6");
  await dryer.getByLabel("Umidade inicial do lote (%)").fill("24");
  await dryer.getByLabel("Umidade final máxima (%)").fill("23");
  await dryer.getByRole("button", { name: "Iniciar secagem" }).click();
  await page.getByRole("button", { name: "Iniciar simulação automática" }).click();
  await expect.poll(async () => (await checkpoint(page))?.batch.elapsed).toBeGreaterThanOrEqual(1);
  const fingerprint = (await checkpoint(page)).fingerprint;
  await screen.selectOption("drying");
  await expect(page.getByRole("button", { name: "Pausar simulação automática" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Valor de FORNO.MASSA", { exact: true })).toHaveText("60 kg");
  await expect(recovery.getByRole("button", { name: "Retomar operação salva" })).toHaveCount(0);
  await screen.selectOption("overview");
  await expect.poll(async () => (await checkpoint(page))?.batch.phase, { timeout: 15000 }).toBe("finished");
  expect((await checkpoint(page)).fingerprint).toBe(fingerprint);
  await openExample(page);
  await screen.selectOption("drying");
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  await expect(page.getByRole("button", { name: "Iniciar simulação automática" })).toHaveAttribute("aria-pressed", "false");
  await expect(dryer.getByRole("status")).toHaveText("Lote seco");
  await expect(page.getByRole("region", { name: "Histórico de lotes secos" }).getByRole("listitem")).toHaveCount(1);
});
