import { observe, type Run } from "./alarmHistory";
import type { ProjectVariable } from "./project";

export interface AlarmRule {
  id: string;
  name: string;
  tag: string;
  kind: "high" | "low" | "on" | "off";
  priority: "Alta" | "Média" | "Baixa";
  threshold: number;
  hysteresis: number;
  delaySeconds: number;
}
export const alarmKinds = { high: "Valor alto", low: "Valor baixo", on: "Ligado / verdadeiro", off: "Desligado / falso" };
export const priorities = ["Alta", "Média", "Baixa"] as const;

export function parseAlarmRules(value: unknown, variables: ProjectVariable[]): AlarmRule[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("Defina até 32 alarmes por projeto.");
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Alarme inválido.");
    const allowed = ["id", "name", "tag", "kind", "priority", "threshold", "hysteresis", "delaySeconds"];
    if (Object.keys(item).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(item, key))) throw new Error("Campos de alarme inválidos.");
    const rule = item as AlarmRule;
    const variable = variables.find(v => v.name === rule.tag);
    if (typeof rule.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(rule.id) || ids.has(rule.id)
      || typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 80 || /[\u0000-\u001f]/.test(rule.name)
      || !variable || !Object.hasOwn(alarmKinds, rule.kind) || !priorities.includes(rule.priority)
      || ![rule.threshold, rule.hysteresis, rule.delaySeconds].every(v => typeof v === "number" && Number.isFinite(v))
      || rule.hysteresis < 0 || rule.delaySeconds < 0 || rule.delaySeconds > 3600) throw new Error("Configuração de alarme inválida.");
    const numeric = rule.kind === "high" || rule.kind === "low";
    if (numeric !== (variable.dataType === "DOUBLE")
      || (numeric && (rule.threshold < variable.min || rule.threshold > variable.max
        || rule.hysteresis > (rule.kind === "high" ? rule.threshold - variable.min : variable.max - rule.threshold)))
      || (!numeric && (rule.threshold !== 0 || rule.hysteresis !== 0))) throw new Error("Tipo, limite ou histerese incompatível com a tag do alarme.");
    ids.add(rule.id);
    return { ...rule, name: rule.name.trim() };
  });
}

function invert(run: Run): Run {
  return { ...run,
    samples: run.samples.map(s => ({ ...s, value: s.value === null ? null : -s.value })),
    events: run.events.map(e => ({ ...e, value: e.value === null ? null : -e.value })),
  };
}

export function observeRule(run: Run, rule: AlarmRule, value: number | boolean | undefined, at: number): Run {
  const reading = value === undefined ? null : typeof value === "boolean" ? Number(value) : value;
  const lower = rule.kind === "low" || rule.kind === "off";
  const threshold = rule.kind === "on" ? 1 : rule.kind === "off" ? 0 : rule.threshold;
  const next = observe(lower ? invert(run) : run, { at, value: reading === null ? null : lower ? -reading : reading },
    lower ? -threshold : threshold, rule.hysteresis, rule.delaySeconds);
  return lower ? invert(next) : next;
}
