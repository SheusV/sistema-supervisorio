import { useEffect, useRef, useState } from "react";
import type { ProjectVariable, TankRule } from "./project";
import { advanceBatch, batchDischargeRate, emptyBatch, newBatch, sampleBatch } from "./drying";

export function useProjectSimulation(variables: ProjectVariable[], enabled: boolean, rule?: TankRule, ovenTag?: string) {
  const [batch, setBatch] = useState(emptyBatch);
  const [values, setValues] = useState<Record<string, number | boolean>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [automatic, setAutomatic] = useState(false);
  const currentValues = useRef<Record<string, number | boolean>>({});
  const tick = useRef<() => void>(() => {});
  const generation = useRef(0);
  const pending = useRef(false);
  const config = JSON.stringify(variables);
  const ruleConfig = JSON.stringify(rule);
  async function evaluate(next: Record<string, number | boolean>, epoch = generation.current, seconds = 0) {
    if (!enabled || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      // Alarm limits belong to the display; the Java endpoint accepts only the physical rule.
      const calculation = rule && { levelTag: rule.levelTag, enableTag: rule.enableTag, permitTag: rule.permitTag, drainTags: rule.drainTags, fillRate: rule.fillRate, drainRate: ovenTag ? batchDischargeRate(batch, rule.drainRate, seconds) : rule.drainRate };
      const response = await fetch("/api/simulation/evaluate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, values: next, ...(calculation ? { rule: calculation, seconds } : {}) }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "O Java recusou o valor ou a configuração das tags." : "Não foi possível comunicar com o simulador Java.");
      const data = await response.json();
      if (data.source !== "SIMULATED" || !data.values || Object.keys(data.values).length !== variables.length
          || variables.some(v => !Object.hasOwn(data.values, v.name) || (v.dataType === "BOOLEAN"
            ? typeof data.values[v.name] !== "boolean" : typeof data.values[v.name] !== "number" || !Number.isFinite(data.values[v.name]) || data.values[v.name] < v.min || data.values[v.name] > v.max)))
        throw new Error("Resposta inválida do simulador.");
      if (ovenTag && (!Number.isFinite(data.discharged) || data.discharged < 0)) throw new Error("Descarga inválida do simulador.");
      if (epoch === generation.current) {
        currentValues.current = data.values; setValues(data.values); setReady(true);
        if (ovenTag && seconds > 0) {
          const at = Date.now();
          setBatch(previous => {
            const next = advanceBatch(previous, data.discharged, data.values[ovenTag] === true, seconds);
            if (previous.phase === "finished") return previous;
            return sampleBatch(next.phase === "finished" ? { ...next, finishedAt: at } : next, at);
          });
        }
      }
    } catch (cause) {
      if (epoch === generation.current) {
        const at = Date.now();
        if (ovenTag) setBatch(b => b.phase === "running" ? sampleBatch(b, at, false) : b);
        setAutomatic(false); setReady(false); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Simulador sem resposta. Tente reconectar.");
      }
    } finally {
      if (epoch === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    const epoch = ++generation.current;
    setBatch(newBatch(rule?.dryingRecipe));
    pending.current = false; currentValues.current = {}; setAutomatic(false); setReady(false); setValues({}); setBusy(false); setError("");
    if (enabled && variables.length) void evaluate({}, epoch);
    return () => { generation.current++; };
    // Configuration changes start a fresh, isolated project simulation.
  }, [config, ruleConfig, enabled, ovenTag]);
  tick.current = () => { if (rule && ready) void evaluate(currentValues.current, generation.current, 1); };
  useEffect(() => {
    if (!enabled || !ready || !automatic || !rule) return;
    const timer = window.setInterval(() => tick.current(), 1000);
    return () => window.clearInterval(timer);
  }, [enabled, ready, automatic, ruleConfig]);
  return { values, ready, busy, error, automatic, batch,
    setInitialMoisture: (moisture: number) => {
      if (!ready || pending.current || !Number.isFinite(moisture) || moisture < 0 || moisture > 100) return;
      setBatch(b => b.phase === "loading" ? { ...b, moisture } : b);
    },
    startBatch: (target: number, duration: number, moistureTarget: number) => {
      if (!ready || pending.current || !ovenTag || !currentValues.current[ovenTag] ||
        !Number.isFinite(moistureTarget) || moistureTarget < 0 || moistureTarget > 100 ||
        !Number.isFinite(target) || target < 20 || target > 120 || !Number.isInteger(duration) || duration < 1 || duration > 3600) return;
      const id = crypto.randomUUID(), started = Date.now();
      setBatch(b => b.phase === "loading" && b.mass > 0 ? sampleBatch({ ...b, id, started, initialMoisture: b.moisture, target, duration, moistureTarget, phase: "running" }, started) : b);
    },
    releaseBatch: () => { if (ready && !pending.current) setBatch(b => b.phase === "finished" ? { ...newBatch(rule?.dryingRecipe), target: b.target, duration: b.duration, moistureTarget: b.moistureTarget } : b); },
    toggleAutomatic: () => { if (rule && ready && !pending.current) setAutomatic(value => !value); },
    write: (name: string, value: number | boolean) => { if (ready) void evaluate({ ...currentValues.current, [name]: value }); },
    retry: () => void evaluate(currentValues.current),
  };
}
