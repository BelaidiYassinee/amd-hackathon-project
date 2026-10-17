// JSX typing for Google's <model-viewer> web component (registered by `import "@google/model-viewer"`).
// React 18 passes unknown props on custom elements through as HTML attributes, so we type them as attributes.
// Boolean attributes (auto-rotate, camera-controls) are on when present: pass "" to turn one on, omit it to turn it off.
import type { CSSProperties, ReactNode } from "react";

interface ModelViewerAttributes {
  children?: ReactNode;
  src: string;
  alt?: string;
  style?: CSSProperties;
  loading?: "auto" | "lazy" | "eager";
  "auto-rotate"?: "";
  "auto-rotate-delay"?: number;
  "rotation-per-second"?: string;
  "camera-controls"?: "";
  "camera-orbit"?: string;
  "field-of-view"?: string;
  "disable-zoom"?: "";
  "disable-pan"?: "";
  "interaction-prompt"?: "auto" | "none";
  "environment-image"?: string;
  exposure?: number;
  "shadow-intensity"?: number;
  "shadow-softness"?: number;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
