import { expect, test, chromium, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function library(page: Page) {
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByText("Projetos salvos", { exact: true }).click();
}

async function documentOf(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test("keeps the full project after closing the browser and confirms replacement", async ({ baseURL }, info) => {
  test.setTimeout(90000);
  const profile = info.outputPath("browser-profile");
  const launch = () => chromium.launchPersistentContext(profile, { channel: "msedge", baseURL });
  const first = await launch();
  let original;
  try {
    const page = await first.newPage();
    await page.goto("/");
    await library(page);
    await page.getByRole("button", { name: "Exemplo de processo" }).click();
    original = await documentOf(page);
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await expect(page.getByLabel("Projeto salvo", { exact: true })).toHaveValue(original.name);
  } finally { await first.close(); }

  const second = await launch();
  try {
    const page = await second.newPage();
    await page.goto("/");
    await library(page);
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByLabel("Nome do projeto")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(original);
    await page.getByRole("button", { name: "Nova tela" }).click();
    await page.getByLabel("Nome do projeto").fill(original.name);
    await page.getByLabel("Nome do projeto").press("Tab");
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByText("Projeto “" + original.name + "” aberto.", { exact: false }).first()).toBeVisible();
    expect(await documentOf(page)).toEqual(original);
    await page.getByRole("button", { name: "Tanque", exact: true }).click();
    const revised = await documentOf(page);
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await page.getByRole("button", { name: "Substituir projeto" }).click();
    await expect(page.getByText("Projeto “" + original.name + "” salvo neste navegador.")).toBeVisible();
    await page.reload();
    await library(page);
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByLabel("Nome do projeto")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(revised);
  } finally { await second.close(); }
});
test("renames saved content and rejects a stale deletion from another tab", async ({ page, context }) => {
  await page.goto("/");
  await library(page);
  await page.getByRole("button", { name: "Exemplo de processo" }).click();
  const original = await documentOf(page);
  const selection = page.getByLabel("Projeto salvo", { exact: true });
  await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
  await expect(selection).toHaveValue(original.name);
  const other = await context.newPage();
  await other.goto("/");
  await library(other);
  await other.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await expect(other.getByRole("button", { name: "Confirmar exclusão" })).toBeVisible();
  await page.getByRole("button", { name: "Renomear", exact: true }).click();
  await page.getByLabel("Novo nome do projeto").fill("Estação de transferência");
  await page.getByRole("button", { name: "Confirmar nome" }).click();
  await expect(selection).toHaveValue("Estação de transferência");
  await other.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(other.getByText(/O projeto mudou em outra aba/)).toBeVisible();
  await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
  expect(await documentOf(page)).toEqual({ ...original, name: "Estação de transferência" });
  await page.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(selection).toHaveValue("Estação de transferência");
  await page.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(selection).toBeDisabled();
  expect(await documentOf(page)).toEqual({ ...original, name: "Estação de transferência" });
  await page.reload();
  await library(page);
  await expect(selection.locator("option")).toHaveText("Nenhum projeto salvo");
});
