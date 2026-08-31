import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apex palette (from apex-design.html)
        blue: { DEFAULT: "#2E7DF6", dark: "#1D5FD0" },
        cyan: "#46C6F5",
        rail: "#0C1830",
        paper: "#EEF2F7",
        card: "#FFFFFF",
        line: "#E1E7EF",
        line2: "#EDF1F6",
        text: "#14233A",
        muted: "#5A6B82",
        faint: "#7A8698",
        under: "#0A8754",
        cash: "#0E8C8C",
        sub: "#FF6A00",
        danger: "#D4503E",
      },
      fontFamily: {
        sans: ["Archivo", "ui-sans-serif", "system-ui", "-apple-system"],
        display: ["Archivo", "ui-sans-serif", "system-ui"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo"],
      },
      borderRadius: {
        DEFAULT: "11px",
        card: "16px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(13,27,46,.05), 0 10px 30px rgba(13,27,46,.07)",
      },
      keyframes: {
        loaderbar: {
          "0%":   { transform: "translateX(-100%)" },
          "50%":  { transform: "translateX(150%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        loaderbar: "loaderbar 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
