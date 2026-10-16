# Machine images

3D renders of the four machines for the dashboard (made in Blender, `machines.blend`).
Transparent background, the same camera angle for every machine, colours matched to the dark UI.

| File (in `web/`, 800×600 WebP, ~20 KB) | Shows |
|---|---|
| `pump.webp` | P-101 and P-102 (centrifugal pump), normal |
| `pump_bearing_wear.webp` | bearing housing glowing red |
| `pump_cavitation.webp` | pump casing and suction nozzle glowing red |
| `pump_misalignment.webp` | shaft coupling glowing red |
| `pump_motor_overheat.webp` | motor glowing red |
| `compressor.webp` | C-201 (screw compressor), normal |
| `conveyor.webp` | M-301 (conveyor drive), normal |

The `.png` files are the 1200×900 masters, for slides and the cover image.

## For P3: use in the frontend

Copy `web/*.webp` to `frontend/public/machines/`, then:

```ts
// src/lib/machineImage.ts
const BASE: Record<string, string> = { "P-101": "pump", "P-102": "pump", "C-201": "compressor", "M-301": "conveyor" };
const GLOW = new Set(["bearing_wear", "cavitation", "misalignment", "motor_overheat"]);

/** Image for a machine card or the alert panel. Pass the diagnosed fault (alert.diagnosis?.fault), not the injected one. */
export function machineImage(machineId: string, fault?: string | null): string {
  const base = BASE[machineId] ?? "pump";
  const glow = base === "pump" && fault && GLOW.has(fault) ? `_${fault}` : "";
  return `/machines/${base}${glow}.webp`;
}
```

- **Machine card:** `machineImage(m.id)` when there is no alert; `machineImage(m.id, alert.diagnosis?.fault)` once the diagnosis is in. The red part then shows what the AI found.
- **Alert panel:** the same image, larger, above the diagnosis card.
- While `diagnosing`, show the normal image (the AI has not decided yet).
- Only the pumps have fault versions: the demo injects faults into P-101 and P-102 only.
