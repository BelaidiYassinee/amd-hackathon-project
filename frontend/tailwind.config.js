/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Factory tab: idle float of the glass cards, and the machine pop-up opening.
      keyframes: {
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "pop-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        // Incident stepper: a soft highlight running along the progress line.
        shimmer: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(300%)" } },
        // Drawers and the demo panel slide in from the right / drop from the header.
        "slide-in": { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "drop-in": { from: { opacity: "0", transform: "translateY(-6px) scale(0.98)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        // Fault hotspot on a machine: a ring that keeps expanding out of the red dot.
        "ping-slow": { "0%": { transform: "scale(1)", opacity: "0.7" }, "80%, 100%": { transform: "scale(2.6)", opacity: "0" } },
      },
      animation: {
        "slide-in": "slide-in 220ms ease-out",
        "drop-in": "drop-in 160ms ease-out",
        "ping-slow": "ping-slow 1.8s cubic-bezier(0, 0, 0.2, 1) infinite",
        shimmer: "shimmer 2.8s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "pop-in": "pop-in 200ms ease-out",
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};
