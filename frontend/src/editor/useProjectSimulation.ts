import { useEffect, useRef, useState } from "react";
import type { ProjectVariable } from "./project";

export function useProjectSimulation(variables: ProjectVariable[], enabled: boolean) {
  const [values, setValues] = useState<Record<string, number | boolean>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  const config = JSON.stringify(variables);
  async function evaluate(next: Record<string, number | boolean>, epoch = generation.current) {
    if (!enabled || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/simulation/evaluate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, values: next }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "O Java recusou o valor ou a configuração das tags." : "Não foi possível comunicar com o simulador Java.");
      const data = await response.json();
      if (data.source !== "SIMULATED" || !data.values || Object.keys(data.values).length !== variables.length
          || variables.some(v => !Object.hasOwn(data.values, v.name) || (v.dataType === "BOOLEAN"
            ? typeof data.values[v.name] !== "boolean" : typeof data.values[v.name] !== "number" || !Number.isFinite(data.values[v.name]) || data.values[v.name] < v.min || data.values[v.name] > v.max)))
        throw new Error("Resposta inválida do simulador.");
      if (epoch === generation.current) { setValues(data.values); setReady(true); }
    } catch (cause) {
      if (epoch === generation.current) { setReady(false); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Simulador sem resposta. Tente reconectar."); }
    } finally {
      if (epoch === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    const epoch = ++generation.current;
    pending.current = false; setReady(false); setValues({}); setBusy(false); setError("");
    if (enabled && variables.length) void evaluate({}, epoch);
    return () => { generation.current++; };
    // Configuration changes start a fresh, isolated manual simulation.
  }, [config, enabled]);
  return { values, ready, busy, error,
    write: (name: string, value: number | boolean) => { if (ready) void evaluate({ ...values, [name]: value }); },
    retry: () => void evaluate(values),
  };
}
