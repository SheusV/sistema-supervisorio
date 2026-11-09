import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function exportProject(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON", exact: true }).click();
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
test("draws a signal on the screen, cancels a draft and reopens the edited connection", async ({ page }) => {
  const original = await exportProject(page);
  const draw = page.getByRole("button", { name: "Desenhar ligação" });
  const source = page.getByRole("button", { name: "P-101 · Topo", exact: true });
  await draw.click();
  await source.click();
  await expect(page.getByRole("button", { name: "P-101 · Base", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(source).toHaveCount(0);
  expect((await exportProject(page)).connections).toEqual(original.connections);

  await draw.click();
  await page.getByLabel("Tipo do traçado").selectOption("signal");
  await source.click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("75");
  await page.getByRole("button", { name: "TQ-101 · Base", exact: true }).click();
  const drawn = await exportProject(page);
  expect(drawn.connections).toHaveLength(original.connections.length + 1);
  const line = drawn.connections.at(-1);
  expect(line).toMatchObject({ from: "pump", fromPort: "top", to: "tank", toPort: "bottom", kind: "signal", binding: null });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).connections).toEqual(original.connections);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Ligações" }).click();
  await page.getByRole("button", { name: "Editar ligação 5", exact: true }).click();
  await page.getByLabel("Tag da ligação").selectOption("LINHA.HABILITADA");
  await page.getByRole("button", { name: "Salvar ligação" }).click();
  const edited = await exportProject(page);
  await page.getByRole("button", { name: "Nova tela", exact: true }).click();
  await page.getByLabel("Arquivo de projeto").setInputFiles({
    name: "processo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(edited)),
  });
  await expect(draw).toBeEnabled();
  expect((await exportProject(page)).connections.at(-1)).toEqual({ ...line, binding: "LINHA.HABILITADA" });
});
test("restores a saved drying recipe through JSON and applies it in operation", async ({ page }) => {
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  const recipe = page.getByRole("region", { name: "Receita de secagem do projeto" });
  await recipe.getByLabel("Temperatura da receita (°C)").fill("45");
  await recipe.getByLabel("Tempo mínimo da receita (s)").fill("15");
  await recipe.getByLabel("Umidade inicial da receita (%)").fill("28");
  await recipe.getByLabel("Umidade final da receita (%)").fill("12");
  await recipe.getByRole("button", { name: "Salvar receita no projeto" }).click();
  const document = await exportProject(page);
  expect(document.simulation.dryingRecipe).toEqual({ target: 45, duration: 15, moisture: 28, moistureTarget: 12, capacity: 1000 });
  await page.getByRole("button", { name: "Nova tela", exact: true }).click();
  await page.getByLabel("Arquivo de projeto").setInputFiles({
    name: "receita.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const dryer = page.getByRole("region", { name: "Secagem dos grãos" });
  await expect(dryer.getByLabel("Temperatura alvo (°C)")).toHaveValue("45");
  await expect(dryer.getByLabel("Tempo mínimo de secagem (s)")).toHaveValue("15");
  await expect(dryer.getByLabel("Umidade inicial do lote (%)")).toHaveValue("28");
  await expect(dryer.getByLabel("Umidade final máxima (%)")).toHaveValue("12");
});

test("preserves excess grain in the silo when the oven fills and resumes after removal", async ({ page }) => {
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  const recipe = page.getByRole("region", { name: "Receita de secagem do projeto" });
  await recipe.getByLabel("Capacidade do forno (kg)").fill("45");
  await recipe.getByRole("button", { name: "Salvar receita no projeto" }).click();
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  for (const name of ["Alternar TRITURADOR.RUN", "Alternar FORNO.RUN", "Iniciar simulação automática"]) {
    await page.getByRole("button", { name }).click();
  }
  const dryer = page.getByRole("region", { name: "Secagem dos grãos" });
  const mass = page.getByLabel("Valor de SILO.MASSA", { exact: true });
  await expect(dryer.getByRole("status")).toHaveText("Forno cheio · descarga bloqueada");
  await expect(mass).toHaveText("155 kg");
  await page.waitForTimeout(1200);
  await expect(mass).toHaveText("155 kg");
  await dryer.getByLabel("Temperatura alvo (°C)").fill("25");
  await dryer.getByLabel("Tempo mínimo de secagem (s)").fill("1");
  await dryer.getByLabel("Umidade final máxima (%)").fill("100");
  await dryer.getByRole("button", { name: "Iniciar secagem" }).click();
  await expect(dryer.getByRole("status")).toHaveText("Lote seco");
  await expect(mass).toHaveText("155 kg");
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  await dryer.getByRole("button", { name: "Retirar lote seco" }).click();
  await page.getByRole("button", { name: "Iniciar simulação automática" }).click();
  await expect(dryer.getByRole("status")).toHaveText("Forno cheio · descarga bloqueada");
  await expect(mass).toHaveText("110 kg");
});

test("fills the solids silo only when feeder and conveyor both run", async ({ page }) => {
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  const project = await exportProject(page);
  expect(project.components.map((item: {kind: string}) => item.kind)).toEqual(expect.arrayContaining(["silo", "conveyor", "feeder", "mixer"]));
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const mass = page.getByLabel("Valor de SILO.MASSA", { exact: true });
  await expect(mass).toHaveText("200 kg");
  await page.getByRole("button", { name: "Alternar DOSADOR.RUN" }).click();
  await page.getByRole("button", { name: "Iniciar simulação automática" }).click();
  await expect(page.getByText(/ESTEIRA.RUN · Bloqueada/)).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(mass).toHaveText("200 kg");
  await page.getByRole("button", { name: "Alternar ESTEIRA.RUN" }).click();
  await expect.poll(async () => parseFloat((await mass.textContent())!)).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Alternar MISTURA.RUN" }).click();
  await expect(page.getByTestId("runtime-mixer")).toContainText("true");
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  await page.getByRole("button", { name: "Alternar DOSADOR.RUN" }).click();
  await page.getByLabel("Novo valor de SILO.MASSA").fill("60");
  await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  await page.getByRole("button", { name: "Alternar TRITURADOR.RUN" }).click();
  await expect(page.getByText(/Descarga · .*Bloqueada/)).toBeVisible();
  await page.getByRole("button", { name: "Alternar FORNO.RUN" }).click();
  await expect(page.getByText(/Descarga · .*Liberada/)).toBeVisible();
  await page.getByRole("button", { name: "Iniciar simulação automática" }).click();
  await expect(mass).toHaveText("0 kg");
  const dryer = page.getByRole("region", { name: "Secagem dos grãos" });
  await expect(dryer).toContainText("60 kg");
  await dryer.getByLabel("Temperatura alvo (°C)").fill("25");
  await dryer.getByLabel("Tempo mínimo de secagem (s)").fill("2");
  await dryer.getByLabel("Umidade inicial do lote (%)").fill("24");
  await expect(dryer.getByText(/Umidade simulada dos grãos/)).toContainText("24%");
  await dryer.getByLabel("Umidade final máxima (%)").fill("23");
  await dryer.getByRole("button", { name: "Iniciar secagem" }).click();
  await expect(dryer.getByRole("status")).toHaveText("Secando até a umidade final");
  await expect(dryer.getByRole("button", { name: "Retirar lote seco" })).toHaveCount(0);
  await expect(dryer.getByRole("status")).toHaveText("Lote seco", { timeout: 10000 });
  await expect(dryer).toContainText("2 / 2 s");
  await expect(dryer.getByText(/Umidade simulada dos grãos/)).toContainText("23%");
  const batches = page.getByRole("region", { name: "Histórico de lotes secos" });
  await expect(batches.getByRole("listitem")).toHaveCount(1);
  await expect(batches.getByRole("listitem")).toContainText("24% → 23%");
  await dryer.getByRole("button", { name: "Retirar lote seco" }).click();
  await expect(dryer.getByRole("status")).toHaveText("Aguardando grãos");
  await expect(dryer.getByLabel("Umidade final máxima (%)")).toHaveValue("23");
  await expect(dryer.getByLabel("Umidade inicial do lote (%)")).toHaveValue("22");
  await page.reload();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(batches.getByRole("listitem")).toHaveCount(1);
  await expect(batches.getByRole("listitem")).toContainText("60 kg");
  await expect(batches.getByRole("listitem")).toContainText("24% → 23%");
  await batches.getByRole("button", { name: "Ver curvas do lote" }).click();
  await expect(batches.getByRole("img")).toHaveCount(2);
  await expect(batches.getByRole("img").first().locator("canvas")).toBeVisible();
});
test("records the high mass alarm, its acknowledgment and its return across reload", async ({ page }) => {
  const loadDose = async () => {
    await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
    await page.getByRole("button", { name: "Operação", exact: true }).click();
    await expect(page.getByLabel("Valor de SILO.MASSA", { exact: true })).toHaveText("200 kg");
  };
  await loadDose();
  const panel = page.getByRole("region", { name: "Alarmes e histórico" });
  const apply = async (mass: string) => {
    await page.getByLabel("Novo valor de SILO.MASSA").fill(mass);
    await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  };
  await apply("780");
  for (const name of ["Alternar DOSADOR.RUN", "Alternar ESTEIRA.RUN", "Iniciar simulação automática"]) {
    await page.getByRole("button", { name }).click();
  }
  await expect(panel.getByText("Alto · aguardando reconhecimento")).toBeVisible();
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  await panel.getByRole("button", { name: "Reconhecer alarme" }).click();
  await expect(panel.getByText("Alto · reconhecido")).toBeVisible();
  await apply("790");
  await expect(panel.getByText("Normal", { exact: true })).toBeVisible();
  await expect(panel.getByRole("img").locator("canvas")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await loadDose();
  await panel.getByRole("combobox", { name: "Operação", exact: true }).selectOption({ index: 1 });
  await expect(panel.getByText(/Última leitura/)).toContainText("790 kg");
  await expect(panel.getByRole("listitem")).toHaveText([/Retorno ao normal/, /Reconhecimento/, /Ativação/]);
  const filter = panel.getByRole("combobox", { name: "Tipo de evento" });
  await filter.selectOption("Reconhecimento");
  await expect(panel.getByRole("listitem")).toHaveText([/Reconhecimento/]);
  await filter.selectOption("Comunicação perdida");
  await expect(panel.getByText("Nenhum evento deste tipo nesta operação.")).toBeVisible();
  await filter.selectOption("");
  await expect(panel.getByRole("listitem")).toHaveCount(3);
});

test("keeps the silo alarm visible through a lost reading and reconnection", async ({ page }) => {
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const panel = page.getByRole("region", { name: "Alarmes e histórico" });
  const apply = page.getByRole("button", { name: "Aplicar SILO.MASSA" });
  const input = page.getByLabel("Novo valor de SILO.MASSA");
  await input.fill("800");
  await apply.click();
  await expect(panel.getByRole("status")).toHaveText("Alto · aguardando reconhecimento");
  const endpoint = "**/api/simulation/evaluate";
  await page.route(endpoint, route => route.abort());
  await input.fill("790");
  await apply.click();
  await expect(panel.getByRole("status")).toHaveText("Sem leitura · último estado: Alto · aguardando reconhecimento");
  const acknowledge = panel.getByRole("button", { name: "Reconhecer alarme" });
  await expect(acknowledge).toBeDisabled();
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Reconectar simulação" }).click();
  await expect(acknowledge).toBeEnabled();
  await acknowledge.click();
  await expect(panel.getByRole("status")).toHaveText("Alto · reconhecido");
  await expect(panel.getByRole("listitem")).toHaveText([
    /Reconhecimento/, /Comunicação restabelecida/, /Comunicação perdida/, /Ativação/,
  ]);
});
