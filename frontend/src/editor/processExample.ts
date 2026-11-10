import { createComponent, type HmiProject, type ComponentKind } from "./project";
import { ovenVariables } from "./ovenTags";

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
export function dosingExample(): HmiProject {
  const item = (id: string, kind: ComponentKind, label: string, x: number, y: number, binding: string) =>
    ({ ...createComponent(kind, 0), id, label, x, y, binding });
  const drives = ["DOSADOR.RUN", "ESTEIRA.RUN", "MISTURA.RUN", "TRITURADOR.RUN", "FORNO.RUN"];
  return {
    schemaVersion: 2, name: "Dosagem de sólidos", screen: { width: 1200, height: 720 },
    alarmRules: [
      { id: "silo-low", name: "Reserva baixa do silo", tag: "SILO.MASSA", kind: "low", priority: "Média", threshold: 50, hysteresis: 25, delaySeconds: 2 },
      { id: "silo-capacity", name: "Silo próximo da capacidade", tag: "SILO.MASSA", kind: "high", priority: "Alta", threshold: 900, hysteresis: 50, delaySeconds: 2 },
      { id: "oven-hot", name: "Temperatura alta do forno", tag: "FORNO.TEMPERATURA", kind: "high", priority: "Alta", threshold: 85, hysteresis: 5, delaySeconds: 2 },
      { id: "oven-wet", name: "Umidade elevada no forno", tag: "FORNO.UMIDADE", kind: "high", priority: "Média", threshold: 20, hysteresis: 1, delaySeconds: 2 },
      { id: "oven-done", name: "Secagem concluída", tag: "FORNO.LOTE_SECO", kind: "on", priority: "Baixa", threshold: 0, hysteresis: 0, delaySeconds: 0 },
    ],
    variables: [
      ...drives.map(name => ({ name, dataType: "BOOLEAN" as const, unit: "", initial: false, min: 0, max: 1 })),
      { name: "SILO.MASSA", dataType: "DOUBLE", unit: "kg", initial: 200, min: 0, max: 1000 },
      ...ovenVariables.map(v => ({ ...v })),
    ],
    simulation: { levelTag: "SILO.MASSA", enableTag: drives[0], permitTag: drives[1], drainTags: drives.slice(3), highLimit: 800, fillRate: 20, drainRate: 30 },
    components: [
      item("feeder", "feeder", "DS-01 · Dosador", 65, 155, drives[0]),
      item("belt", "conveyor", "ET-01 · Esteira", 345, 155, drives[1]),
      { ...item("silo", "silo", "SL-01 · Silo", 650, 155, "SILO.MASSA"), rangeMin: 0, rangeMax: 1000 },
      item("mixer", "mixer", "MX-01 · Misturador", 945, 155, drives[2]),
      item("crusher", "crusher", "TR-01 · Triturador", 650, 330, drives[3]),
      item("oven", "oven", "FR-01 · Forno", 945, 330, drives[4]),
      item("oven-temp", "sensor", "Temperatura do forno", 65, 330, "FORNO.TEMPERATURA"),
      item("oven-moisture", "sensor", "Umidade dos grãos", 345, 330, "FORNO.UMIDADE"),
      item("feed-cmd", "button", "Comandar dosador", 65, 530, drives[0]),
      item("belt-cmd", "button", "Comandar esteira", 345, 530, drives[1]),
      item("weigh", "setpoint", "Ajustar massa", 650, 530, "SILO.MASSA"),
      item("mix-cmd", "button", "Comandar misturador", 945, 530, drives[2]),
    ],
    connections: [
      { id: "silo-crusher", from: "silo", fromPort: "bottom", to: "crusher", toPort: "top", kind: "pipe", binding: null },
      { id: "crusher-oven", from: "crusher", fromPort: "right", to: "oven", toPort: "left", kind: "pipe", binding: null },
      { id: "feed-belt", from: "feeder", fromPort: "right", to: "belt", toPort: "left", kind: "signal", binding: drives[0] },
      { id: "belt-bin", from: "belt", fromPort: "right", to: "silo", toPort: "left", kind: "signal", binding: drives[1] },
    ],
  };
}
