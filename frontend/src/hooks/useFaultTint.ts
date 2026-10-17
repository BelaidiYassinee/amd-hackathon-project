import { useEffect, type RefObject } from "react";

// The slice of model-viewer's scene-graph API we use (see @google/model-viewer features/scene-graph).
type RGB = [number, number, number];
type RGBA = [number, number, number, number];
interface Material {
  name: string;
  emissiveFactor: Readonly<RGB>;
  setEmissiveFactor(rgb: RGB): void;
  pbrMetallicRoughness: {
    baseColorFactor: Readonly<RGBA>;
    metallicFactor: number;
    setBaseColorFactor(rgba: RGBA): void;
    setMetallicFactor(v: number): void;
  };
}
type ModelViewer = HTMLElement & { loaded?: boolean; model?: { materials: Material[] } };

// Red for a part that is failing (an alert), amber for one that is drifting (early warning).
const TINT = {
  red: { base: [0.78, 0.07, 0.05, 1] as RGBA, glow: [1, 0.04, 0.03] as RGB },
  amber: { base: [0.85, 0.5, 0.05, 1] as RGBA, glow: [1, 0.55, 0.05] as RGB },
};
const FRAME_MS = 60; // ~16 fps is plenty for a slow glow, and keeps four viewers cheap

/**
 * Paints one fault zone of a <model-viewer> red (or amber), with a slow glow, and restores the original look when `zone` clears.
 * The zone's materials are named "<material>__<zone>" by scripts/blender/fault_zones.py.
 */
export function useFaultTint(ref: RefObject<HTMLElement>, zone: string | null, color: keyof typeof TINT = "red") {
  useEffect(() => {
    const el = ref.current as ModelViewer | null;
    if (!el || !zone) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setInterval> | undefined;
    let restore = () => {};

    const apply = () => {
      restore();
      const mats = el.model?.materials.filter((m) => m.name.endsWith(`__${zone}`)) ?? [];
      if (mats.length === 0) return;
      const saved = mats.map((m) => ({
        m,
        base: [...m.pbrMetallicRoughness.baseColorFactor] as RGBA,
        metal: m.pbrMetallicRoughness.metallicFactor,
        emissive: [...m.emissiveFactor] as RGB,
      }));
      for (const m of mats) {
        m.pbrMetallicRoughness.setBaseColorFactor(TINT[color].base);
        m.pbrMetallicRoughness.setMetallicFactor(0.15); // metal reflects the grey studio, so it would never read as red
      }
      const [r, g, b] = TINT[color].glow;
      const glow = (k: number) => mats.forEach((m) => m.setEmissiveFactor([k * r, k * g, k * b]));
      if (still) glow(0.45);
      else timer = setInterval(() => glow(0.2 + 0.4 * (0.5 + 0.5 * Math.sin(performance.now() / 450))), FRAME_MS);

      restore = () => {
        clearInterval(timer);
        for (const s of saved) {
          s.m.pbrMetallicRoughness.setBaseColorFactor(s.base);
          s.m.pbrMetallicRoughness.setMetallicFactor(s.metal);
          s.m.setEmissiveFactor(s.emissive);
        }
        restore = () => {};
      };
    };

    if (el.loaded) apply();
    el.addEventListener("load", apply); // first load, and again if the src ever changes
    return () => {
      el.removeEventListener("load", apply);
      restore();
    };
  }, [ref, zone, color]);
}
