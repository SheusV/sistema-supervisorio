import { test, expect, type Page } from "@playwright/test";

async function openDosing(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const panel = page.getByRole("region", { name: "Retomada da operação" });
  await expect(panel.getByRole("status")).toBeVisible();
  await expect(panel.getByRole("status")).not.toHaveText("Consultando operação salva…");
  return panel;
}

async function checkpoint(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("nexo-operation-history");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("checkpoints").objectStore("checkpoints").get(JSON.stringify(["Dosagem de sólidos", "FORNO.RUN"]));
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }));
}

async function applyMass(page: Page, value: string) {
  await page.getByLabel("Novo valor de SILO.MASSA").fill(value);
  await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  await expect.poll(async () => (await checkpoint(page))?.values["SILO.MASSA"]).toBe(Number(value));
}

test("restores a drying batch paused, preserves curves and avoids duplicate completed lots", async ({ page }) => {
  await openDosing(page);
  await applyMass(page, "60");
  for (const name of ["Alternar TRITURADOR.RUN", "Alternar FORNO.RUN", "Iniciar simulação automática"]) {
    await page.getByRole("button", { name }).click();
  }
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
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  await expect(page.getByRole("region", { name: "Retomada da operação" }).getByRole("status")).toContainText("Ponto de retomada salvo");
  const saved = await checkpoint(page);
  const recovery = await openDosing(page);
  await expect(recovery.getByRole("status")).toHaveText("Operação salva encontrada");
  await expect(page.getByRole("button", { name: "Iniciar simulação automática" })).toBeDisabled();
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  const start = page.getByRole("button", { name: "Iniciar simulação automática" });
  await expect(start).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Valor de FORNO.MASSA", { exact: true })).toHaveText("60 kg");
  await expect(page.getByLabel("Valor de FORNO.UMIDADE", { exact: true })).toHaveText(saved.batch.moisture + " %");
  await expect(page.getByLabel("Valor de FORNO.TEMPO", { exact: true })).toHaveText(saved.batch.elapsed + " s");
  await page.waitForTimeout(1200);
  await expect(page.getByLabel("Valor de FORNO.TEMPO", { exact: true })).toHaveText(saved.batch.elapsed + " s");
  await expect.poll(async () => (await checkpoint(page))?.batch.samples.some((s: any) => s.temperature === null)).toBe(true);
  await start.click();
  await expect.poll(async () => (await checkpoint(page))?.batch.phase, { timeout: 10000 }).toBe("finished");
  const lots = page.getByRole("region", { name: "Histórico de lotes secos" });
  await expect(lots.getByRole("listitem")).toHaveCount(1);
  await openDosing(page);
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  await expect(dryer.getByRole("status")).toHaveText("Lote seco");
  await expect(lots.getByRole("listitem")).toHaveCount(1);
});

test("protects the checkpoint from conflicting writes in two tabs", async ({ page, context }) => {
  await openDosing(page);
  await applyMass(page, "300");
  const original = await checkpoint(page);
  const other = await context.newPage();
  const recovery = await openDosing(other);
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  await expect.poll(async () => (await checkpoint(other))?.revision).not.toBe(original.revision);
  await page.getByLabel("Novo valor de SILO.MASSA").fill("400");
  await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  await expect(page.getByRole("region", { name: "Retomada da operação" }).getByRole("alert")).toContainText("Outra aba");
  expect((await checkpoint(page)).values["SILO.MASSA"]).toBe(300);
  await expect(page.getByRole("button", { name: "Iniciar simulação automática" })).toBeDisabled();
});

test("retains the saved point when backend validation fails and permits retry", async ({ page }) => {
  await openDosing(page);
  await applyMass(page, "300");
  const recovery = await openDosing(page);
  await page.route("**/api/simulation/evaluate", route => route.abort());
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  await expect(recovery.getByRole("alert")).toContainText("Não foi possível validar");
  expect((await checkpoint(page)).values["SILO.MASSA"]).toBe(300);
  await page.unroute("**/api/simulation/evaluate");
  await recovery.getByRole("button", { name: "Retomar operação salva" }).click();
  await expect(page.getByLabel("Valor de SILO.MASSA", { exact: true })).toHaveText("300 kg");
  await expect(page.getByRole("button", { name: "Iniciar simulação automática" })).toHaveAttribute("aria-pressed", "false");
});

test("rejects a corrupted batch and starts a fresh operation only after an explicit choice", async ({ page }) => {
  await openDosing(page);
  await applyMass(page, "300");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("nexo-operation-history");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("checkpoints", "readwrite");
      const store = tx.objectStore("checkpoints");
      const read = store.get(JSON.stringify(["Dosagem de sólidos", "FORNO.RUN"]));
      read.onsuccess = () => { const point = read.result; point.batch.temperature = 999; point.revision = 123; store.put(point); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  const recovery = await openDosing(page);
  await expect(recovery.getByRole("alert")).toContainText("incompatível");
  await expect(recovery.getByRole("button", { name: "Retomar operação salva" })).toHaveCount(0);
  await recovery.getByRole("button", { name: "Iniciar nova operação" }).click();
  await expect(page.getByLabel("Valor de SILO.MASSA", { exact: true })).toHaveText("200 kg");
  await expect.poll(async () => (await checkpoint(page))?.batch.temperature).toBe(20);
});

test("upgrades an existing history database and preserves earlier completed lots", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("nexo-operation-history", 2);
    request.onupgradeneeded = () => {
      for (const name of ["runs", "batches"]) {
        const store = request.result.createObjectStore(name, { keyPath: "id" });
        store.createIndex("byScope", "scope");
        store.createIndex("byTime", ["scope", "started", "id"]);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("batches", "readwrite");
      tx.objectStore("batches").put({
        id: "legacy", scope: JSON.stringify(["Dosagem de sólidos", "FORNO.RUN"]), started: 1, unit: "kg",
        batch: { phase: "finished", mass: 12, temperature: 25, target: 25, duration: 1, elapsed: 1,
          moisture: 20, moistureTarget: 20, initialMoisture: 22, finishedAt: 2 },
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }));
  await openDosing(page);
  await expect(page.getByRole("region", { name: "Histórico de lotes secos" }).getByRole("listitem")).toContainText("12 kg");
  await expect.poll(async () => (await checkpoint(page))?.schemaVersion).toBe(1);
});
