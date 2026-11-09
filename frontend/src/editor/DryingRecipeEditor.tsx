import type { HmiProject } from "./project";
import { newBatch } from "./drying";

export function DryingRecipeEditor({ project, commit }: { project: HmiProject; commit: (next: HmiProject) => boolean }) {
  const rule = project.simulation;
  if (!rule || !project.components.some(c => c.kind === "oven")) return null;
  const recipe = newBatch(rule.dryingRecipe);
  return <section aria-label="Receita de secagem do projeto">
    <h3>Receita de secagem do projeto</h3>
    <p>Estes valores iniciam a operação e acompanham o projeto salvo ou exportado. Ajustes feitos em Operação valem para a sessão atual.</p>
    <form className="project-form" onSubmit={e => {
      e.preventDefault();
      const fields = new FormData(e.currentTarget);
      commit({ ...project, simulation: { ...rule, dryingRecipe: {
        target: Number(fields.get("target")), duration: Number(fields.get("duration")),
        moisture: Number(fields.get("moisture")), moistureTarget: Number(fields.get("moistureTarget")),
        capacity: Number(fields.get("capacity")),
      } } });
    }}>
      <label>Temperatura da receita (°C)<input name="target" type="number" min="20" max="120" step="any" defaultValue={recipe.target} required /></label>
      <label>Tempo mínimo da receita (s)<input name="duration" type="number" min="1" max="3600" defaultValue={recipe.duration} required /></label>
      <label>Umidade inicial da receita (%)<input name="moisture" type="number" min="0" max="100" step="any" defaultValue={recipe.moisture} required /></label>
      <label>Umidade final da receita (%)<input name="moistureTarget" type="number" min="0" max="100" step="any" defaultValue={recipe.moistureTarget} required /></label>
      <label>Capacidade do forno ({project.variables?.find(v => v.name === rule.levelTag)?.unit || "unidade da tag"})<input name="capacity" type="number" min="1" max="1000000" step="any" defaultValue={recipe.capacity} required /></label>
      <button>Salvar receita no projeto</button>
    </form>
  </section>;
}
