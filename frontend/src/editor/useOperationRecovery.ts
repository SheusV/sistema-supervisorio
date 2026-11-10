import { useEffect, useMemo, useRef, useState } from "react";
import { serializeProject, type HmiProject } from "./project";
import { parseCheckpoint, type OperationCheckpoint } from "./operationCheckpoint";
import { readCheckpoint, writeCheckpoint } from "./operationArchive";
import type { useProjectSimulation } from "./useProjectSimulation";

type Mode = "inactive" | "reading" | "choice" | "working" | "active" | "error" | "volatile";

export function useOperationRecovery(project: HmiProject, enabled: boolean, simulation: ReturnType<typeof useProjectSimulation>, ovenTag?: string) {
  const fingerprint = useMemo(() => serializeProject(project), [project]);
  const scope = JSON.stringify([project.name, ovenTag ?? "process"]);
  const [mode, setMode] = useState<Mode>("reading");
  const [candidate, setCandidate] = useState<OperationCheckpoint | null>(null);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<number>();
  const [saving, setSaving] = useState(false);
  const latest = useRef("");
  const [reload, setReload] = useState(0);
  const revision = useRef<string | null>(null);
  const epoch = useRef(0);
  const failed = useRef(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    const current = ++epoch.current;
    revision.current = null; failed.current = false;
    setCandidate(null); setMessage(""); setSavedAt(undefined);
    setSaving(false); latest.current = "";
    setMode(enabled ? "reading" : "inactive");
    if (!enabled) return;
    readCheckpoint(scope).then(raw => {
      if (current !== epoch.current) return;
      revision.current = typeof raw?.revision === "string" ? raw.revision : null;
      if (!raw) { setMode("active"); return; }
      try { setCandidate(parseCheckpoint(raw, project, scope)); }
      catch (error) { setMessage((error as Error).message); }
      setMode("choice");
    }).catch(error => {
      if (current === epoch.current) { setMode("error"); setMessage((error as Error).message); }
    });
    return () => { epoch.current++; };
  }, [enabled, scope, fingerprint, reload]);
  useEffect(() => {
    if (!enabled || mode !== "active" || !simulation.ready || simulation.busy || failed.current) return;
    const current = epoch.current;
    const point: OperationCheckpoint = { schemaVersion: 1, scope, fingerprint, revision: crypto.randomUUID(), savedAt: Date.now(),
      values: simulation.values, batch: simulation.batch };
    latest.current = point.revision;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      if (current !== epoch.current || failed.current) return;
      try {
        await writeCheckpoint(scope, point, revision.current);
        if (current !== epoch.current) return;
        revision.current = point.revision;
        if (latest.current === point.revision) { setSavedAt(point.savedAt); setSaving(false); }
      } catch (error) {
        if (current === epoch.current) {
          failed.current = true; setSaving(false); setMessage((error as Error).message); setMode("error");
        }
      }
    });
  }, [enabled, mode, simulation.values, simulation.batch, simulation.ready, simulation.busy, scope, fingerprint]);
  return {
    mode, candidate, message, savedAt, saving,
    blocked: enabled && !["active", "volatile"].includes(mode),
    reload: () => setReload(value => value + 1),
    continueWithoutSaving: () => setMode("volatile"),
    resume: async () => {
      if (!candidate || simulation.busy) return;
      const current = epoch.current;
      setMode("working");
      const accepted = await simulation.restore(candidate);
      if (current !== epoch.current) return;
      setMode(accepted ? "active" : "choice");
      if (accepted) { setCandidate(null); setMessage(""); }
      else setMessage("Não foi possível validar os valores no simulador. Tente novamente.");
    },
    discard: async () => {
      if (simulation.busy) return;
      const current = epoch.current;
      setMode("working");
      try {
        if (!await simulation.reset()) throw new Error("Não foi possível iniciar a operação no simulador. Tente novamente.");
        if (current !== epoch.current) return;
        await writeCheckpoint(scope, undefined, revision.current);
        if (current !== epoch.current) return;
        revision.current = null; failed.current = false;
        setCandidate(null); setMessage(""); setMode("active");
      } catch (error) {
        if (current === epoch.current) { setMessage((error as Error).message); setMode("error"); }
      }
    },
  };
}
