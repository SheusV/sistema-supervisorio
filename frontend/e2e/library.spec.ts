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
    await expect(page.getByLabel("Nome da tela")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(original);
    await page.getByRole("button", { name: "Nova tela" }).click();
    await page.getByLabel("Nome da tela").fill(original.name);
    await page.getByLabel("Nome da tela").press("Tab");
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
    await expect(page.getByLabel("Nome da tela")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(revised);
  } finally { await second.close(); }
});
