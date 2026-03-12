import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#f2f4f1",
        panel: "#fbfcfa",
        ink: "#113235",
        muted: "#5b6c6e",
        accent: "#1f7a70",
        accentSoft: "#d8ebe8",
        border: "#d8dfd9"
      },
      boxShadow: {
        card: "0 16px 40px rgba(17, 50, 53, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
