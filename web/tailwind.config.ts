import type { Config } from "tailwindcss";

// Tokens from docs/ui.md §1. Do not add colours or fonts here without changing the spec.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16173F",
        marigold: "#F4A300",
        paper: "#F6F7FB",
        surface: "#FFFFFF",
        allow: "#12805C",
        block: "#C8283B",
        mute: "#6B6F8C",
        line: "#E3E5F0",
        quickloan: "#2F5BEA",
        medicare: "#0E9AA7",
        foodrush: "#E4572E",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      // Deliberately different radii (ui.md §1.3): passes and sheets, rows, switches.
      borderRadius: {
        pass: "20px",
        row: "14px",
        pill: "999px",
      },
    },
  },
  plugins: [],
} satisfies Config;
