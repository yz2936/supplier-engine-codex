import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        steel: {
          50: "#f3f7fa",
          100: "#d9e4ec",
          200: "#b6cad7",
          300: "#8dadc0",
          400: "#668ea8",
          500: "#4a738d",
          600: "#35586f",
          700: "#273f51",
          800: "#1b2a36",
          900: "#111921"
        }
      }
    }
  },
  plugins: []
};

export default config;
