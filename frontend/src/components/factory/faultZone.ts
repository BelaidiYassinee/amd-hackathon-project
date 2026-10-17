import type { Alert, DiagnosedFault, MachineSummary } from "../../types";
import { modelName } from "./machineModel";
import zonesJson from "./modelZones.json";

/** Zone top-centres in model coordinates, written by scripts/blender/fault_zones.py. */
const ZONE_POSITION: Record<string, Record<string, number[]>> = zonesJson;

const ZONE_LABEL: Record<string, string> = {
  motor: "Motor",
  coupling: "Coupling & shaft",
  bearing: "Bearing housing",
  casing: "Pump casing",
  airend: "Air end",
  separator: "Oil separator",
  gearbox: "Gearbox",
  belt: "Belt & drums",
};

// Where each diagnosed fault lives on each kind of machine.
const FAULT_ZONE: Record<string, Partial<Record<DiagnosedFault, string>>> = {
  pump: { bearing_wear: "bearing", cavitation: "casing", misalignment: "coupling", motor_overheat: "motor" },
  compressor: { bearing_wear: "airend", cavitation: "airend", misalignment: "coupling", motor_overheat: "motor" },
  conveyor: { bearing_wear: "gearbox", cavitation: "belt", misalignment: "gearbox", motor_overheat: "motor" },
};

// Before the diagnosis (or for "other"): the part the most deviating signal measures.
const SIGNAL_ZONE: Record<string, Record<string, string>> = {
  pump: {
    vibration_rms: "bearing", vibration_hf: "bearing", bearing_temp: "bearing",
    motor_temp: "motor", motor_current: "motor", discharge_pressure: "casing", flow: "casing",
  },
  compressor: { vibration_rms: "airend", motor_temp: "motor", motor_current: "motor", discharge_pressure: "separator", oil_temp: "separator" },
  conveyor: { vibration_rms: "gearbox", gearbox_temp: "gearbox", motor_temp: "motor", motor_current: "motor", belt_speed: "belt" },
};

export interface FaultZone {
  /** Material suffix in the GLB: every material named "<name>__<zone>" turns red. */
  zone: string;
  label: string;
  /** "x y z" in metres, for a model-viewer hotspot. */
  position: string;
}

/** The part of the machine that is not working, or null while the machine runs normally. */
export function faultZone(machine: MachineSummary, alert: Alert | null): FaultZone | null {
  if (!machine.active_alert_id && machine.status !== "down") return null;
  const model = modelName(machine.id);
  const top = alert?.event.contributions.reduce((a, b) => (b.score > a.score ? b : a), alert.event.contributions[0]);
  const zone = (alert?.diagnosis && FAULT_ZONE[model]?.[alert.diagnosis.fault]) || (top && SIGNAL_ZONE[model]?.[top.signal]) || "motor";
  const p = ZONE_POSITION[model]?.[zone] ?? [0, 1, 0];
  return { zone, label: ZONE_LABEL[zone] ?? zone, position: `${p[0]}m ${p[1]}m ${p[2]}m` };
}
