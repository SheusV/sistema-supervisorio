import { describe, expect, it } from "vitest";
import { acknowledge, emptyRun, observe } from "./alarmHistory";

describe("high alarm", () => {
  it("restarts the activation delay after a failed reading and applies hysteresis on return", () => {
    let run = observe(emptyRun, { at: 0, value: 800 }, 800, 20, 2);
    expect(run.pendingSince).toBe(0);
    run = observe(run, { at: 1000, value: null }, 800, 20, 2);
    expect(run.pendingSince).toBeUndefined();
    run = observe(run, { at: 3000, value: 800 }, 800, 20, 2);
    expect(run.high).toBe(false);
    run = observe(run, { at: 4999, value: 800 }, 800, 20, 2);
    expect(run.high).toBe(false);
    run = observe(run, { at: 5000, value: 800 }, 800, 20, 2);
    expect(run.high).toBe(true);
    run = acknowledge(run, 5001);
    run = observe(run, { at: 6000, value: 790 }, 800, 20, 2);
    expect(run.high && run.acknowledged).toBe(true);
    run = observe(run, { at: 7000, value: 780 }, 800, 20, 2);
    expect(run.high).toBe(false);
    expect(run.events.map(e => e.kind)).toEqual([
      "Comunicação perdida", "Comunicação restabelecida", "Ativação", "Reconhecimento", "Retorno ao normal",
    ]);
  });
  it("cancels a pending activation when the value falls below the high threshold", () => {
    let run = observe(emptyRun, { at: 0, value: 800 }, 800, 20, 2);
    run = observe(run, { at: 1000, value: 799 }, 800, 20, 2);
    expect(run.pendingSince).toBeUndefined();
    run = observe(run, { at: 3000, value: 800 }, 800, 20, 2);
    expect(run.high).toBe(false);
    expect(run.pendingSince).toBe(3000);
  });
  it("holds the active alarm during missing readings and clears it only on a valid lower reading", () => {
    let run = observe(emptyRun, { at: 1, value: 950 }, 1000);
    run = observe(run, { at: 2, value: 1000 }, 1000);
    run = observe(run, { at: 3, value: null }, 1000);
    expect(run.high).toBe(true);
    expect(acknowledge(run, 4)).toBe(run);
    expect(observe(run, { at: 5, value: null }, 1000)).toBe(run);
    run = observe(run, { at: 6, value: 950 }, 1000);
    expect(run.high).toBe(false);
    expect(run.events.map(event => event.kind)).toEqual([
      "Ativação", "Comunicação perdida", "Comunicação restabelecida", "Retorno ao normal",
    ]);
  });
  it("triggers at equality, preserves acknowledged alarms across gaps and rearms below the threshold", () => {
    let run = emptyRun;
    for (const [at, value] of [790, 800, 801].entries()) run = observe(run, { at, value }, 800);
    run = acknowledge(run, 3);
    run = acknowledge(run, 4);
    run = observe(run, { at: 5, value: null }, 800);
    expect(run.high && run.acknowledged).toBe(true);
    for (const [i, value] of [805, 799, 800].entries()) run = observe(run, { at: i + 6, value }, 800);
    expect(run.events.map(e => e.kind)).toEqual(["Ativação", "Reconhecimento", "Comunicação perdida", "Comunicação restabelecida", "Retorno ao normal", "Ativação"]);
    expect(run.high && !run.acknowledged).toBe(true);
  });
});
