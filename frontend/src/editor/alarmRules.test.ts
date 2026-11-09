import { expect, it } from "vitest";
import { acknowledge, emptyRun } from "./alarmHistory";
import { observeRule, parseAlarmRules, type AlarmRule } from "./alarmRules";
import { dosingExample } from "./processExample";
import { parseProject, replaceVariable, serializeProject } from "./project";

const rule: AlarmRule = { id: "low", name: "Massa baixa", tag: "SILO.MASSA", kind: "low",
  priority: "Alta", threshold: 100, hysteresis: 20, delaySeconds: 0 };

it("detects low alarms with raw readings, acknowledgment and return hysteresis", () => {
  let run = observeRule(emptyRun, rule, 100, 1);
  expect(run.high).toBe(true);
  expect(run.events[0].value).toBe(100);
  run = acknowledge(run, 2);
  run = observeRule(run, rule, 110, 3);
  expect(run.high && run.acknowledged).toBe(true);
  run = observeRule(run, rule, undefined, 4);
  expect(acknowledge(run, 5)).toBe(run);
  run = observeRule(run, rule, 120, 6);
  expect(run.high).toBe(false);
  expect(run.events.at(-1)?.value).toBe(120);
});

it.each(["on", "off"] as const)("tracks boolean %s alarms and preserves active state on disconnect", kind => {
  const stateRule = { ...rule, tag: "DOSADOR.RUN", kind, threshold: 0, hysteresis: 0 };
  let run = observeRule(emptyRun, stateRule, kind === "on", 1);
  expect(run.high).toBe(true);
  run = observeRule(run, stateRule, undefined, 2);
  expect(run.high).toBe(true);
  run = observeRule(run, stateRule, kind !== "on", 3);
  expect(run.high).toBe(false);
});

it("serializes rules and follows tag renames without changing other rules", () => {
  const project = { ...dosingExample(), alarmRules: [rule] };
  expect(parseProject(serializeProject(project))).toEqual(project);
  const variable = project.variables!.find(v => v.name === "SILO.MASSA")!;
  const next = replaceVariable(project, variable.name, { ...variable, name: "SL01.MASSA" });
  expect(next.alarmRules?.[0].tag).toBe("SL01.MASSA");
});

it("rejects duplicates, dangling tags, type mismatches and executable fields", () => {
  const variables = dosingExample().variables!;
  for (const invalid of [
    [rule, rule], [{ ...rule, tag: "MISSING" }], [{ ...rule, tag: "DOSADOR.RUN" }],
    [{ ...rule, script: "anything" }], [{ ...rule, hysteresis: 901 }],
    [{ ...rule, kind: "off" }], [{ ...rule, delaySeconds: -1 }],
  ]) expect(() => parseAlarmRules(invalid, variables)).toThrow();
});
