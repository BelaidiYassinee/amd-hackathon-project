// Which 3D model shows which machine (GLB files in public/models/, exported from assets/machines/machines.blend).
const MODEL: Record<string, string> = { "P-101": "pump", "P-102": "pump", "C-201": "compressor", "M-301": "conveyor" };

// Starting angle per machine, so the two pumps never turn in lockstep.
const START_THETA: Record<string, number> = { "P-101": 30, "P-102": 210, "C-201": 120, "M-301": 300 };

export function modelSrc(machineId: string): string {
  return `/models/${MODEL[machineId] ?? "pump"}.glb`;
}

/**
 * model-viewer `camera-orbit`: horizontal angle, a slightly-from-above view, distance.
 * `zoom` is a share of the auto distance (which fits the model at any angle with a wide margin): lower is closer.
 */
export function cameraOrbit(machineId: string, zoom = 100): string {
  return `${START_THETA[machineId] ?? 0}deg 72deg ${zoom}%`;
}
