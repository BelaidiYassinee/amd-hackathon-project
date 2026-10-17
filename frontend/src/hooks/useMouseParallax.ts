import { useEffect, type RefObject } from "react";

/**
 * Writes the mouse position, eased, to the CSS variables `--mx` and `--my` (-1..1, 0 = screen centre) on `ref`.
 * Children use them in `transform: calc(...)`, so the motion costs no React re-render.
 * The animation loop only runs while the values are still moving, and never with reduced motion.
 */
export function useMouseParallax(ref: RefObject<HTMLElement>, ease = 0.06) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 0, ty = 0; // target
    let x = 0, y = 0; // current
    let frame = 0;

    const step = () => {
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      el.style.setProperty("--mx", x.toFixed(4));
      el.style.setProperty("--my", y.toFixed(4));
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.0005 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(step);
    };
    // Mouse leaves the window: drift back to the middle.
    const onLeave = () => {
      tx = ty = 0;
      if (!frame) frame = requestAnimationFrame(step);
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [ref, ease]);
}
