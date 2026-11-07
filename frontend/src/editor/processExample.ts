import { createComponent, type HmiProject, type ComponentKind } from "./project";

/** Demonstrates shared tag bindings; the drawing is not a hydraulic solver. */
export function processExample(): HmiProject {
  function component(id: string, kind: ComponentKind, label: string, x: number, y: number, binding: string | null) {
    return { ...createComponent(kind, 0), id, label, x, y, binding };
  }
  return {
    schemaVersion: 2, name: "Linha de transferência — simulação", screen: { width: 1200, height: 720 },
    simulation: { levelTag: "TANQUE.NIVEL", enableTag: "LINHA.HABILITADA", fillRate: 5, drainRate: 1 },
    variables: [
      { name: "LINHA.HABILITADA", dataType: "BOOLEAN", unit: "", initial: false, min: 0, max: 1 },
      { name: "TANQUE.NIVEL", dataType: "DOUBLE", unit: "%", initial: 35, min: 0, max: 100 },
      { name: "TEMP.VALOR", dataType: "DOUBLE", unit: "°C", initial: 25, min: -20, max: 150 },
    ],
    components: [
      { ...component("title", "text", "LINHA DE TRANSFERÊNCIA", 80, 50, null), width: 450 },
      component("pump", "pump", "P-101", 70, 260, "LINHA.HABILITADA"),
      component("valve", "valve", "XV-101", 350, 260, "LINHA.HABILITADA"),
      component("tank", "tank", "TQ-101", 650, 180, "TANQUE.NIVEL"),
      component("sensor", "sensor", "TT-101", 970, 230, "TEMP.VALOR"),
      component("motor", "motor", "M-101", 70, 480, "LINHA.HABILITADA"),
      component("command", "button", "Ligar / desligar linha", 350, 500, "LINHA.HABILITADA"),
      component("level-input", "setpoint", "Ajustar nível", 650, 500, "TANQUE.NIVEL"),
    ],
    connections: [
      { id: "pipe1", from: "pump", to: "valve", fromPort: "right", toPort: "left", kind: "pipe", binding: "LINHA.HABILITADA" },
      { id: "pipe2", from: "valve", to: "tank", fromPort: "right", toPort: "left", kind: "pipe", binding: "LINHA.HABILITADA" },
      { id: "signal1", from: "tank", to: "sensor", fromPort: "right", toPort: "left", kind: "signal", binding: null },
      { id: "signal2", from: "motor", to: "pump", fromPort: "top", toPort: "bottom", kind: "signal", binding: "LINHA.HABILITADA" },
    ],
  };
}
