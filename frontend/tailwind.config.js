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
      },
      animation: {
        shimmer: "shimmer 2.8s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "pop-in": "pop-in 200ms ease-out",
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};
