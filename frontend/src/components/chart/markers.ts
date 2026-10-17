import type { MarkerKind } from "../../types";

export interface MarkerStyle {
  color: string;
  width: number;
  dash?: string;
  label?: string; // drawn on the top chart only
  labelPos: "insideTopRight" | "insideBottomRight";
}

// The AI marker must stand out (red, thick) against the legacy alarm (orange).
export const MARKER_STYLES: Record<MarkerKind, MarkerStyle> = {
  fault_injected: { color: "#71717a", width: 1.5, dash: "5 4", label: "Fault injected (demo)", labelPos: "insideBottomRight" },
  ai_detected: { color: "#ef4444", width: 3, label: "AI detected", labelPos: "insideTopRight" },
  threshold_alarm: { color: "#fb923c", width: 2, label: "Legacy alarm", labelPos: "insideTopRight" },
  failure: { color: "#a1a1aa", width: 2, label: "Trip", labelPos: "insideBottomRight" },
  acknowledged: { color: "#3b82f6", width: 1.5, labelPos: "insideTopRight" },
  resolved: { color: "#10b981", width: 1.5, labelPos: "insideTopRight" },
};

export const AXIS_COLOR = "#71717a"; // zinc-500
export const GRID_COLOR = "#27272a"; // zinc-800
export const LINE_COLOR = "#38bdf8"; // sky-400
export const ALARM_COLOR = "#ef4444";
export const Y_AXIS_WIDTH = 52; // fixed so all small multiples line up
