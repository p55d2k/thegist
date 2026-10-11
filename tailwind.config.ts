import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./constants/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    "from-indigo-500",
    "to-violet-500",
    "from-indigo-600",
    "to-violet-600",
    "from-cyan-500",
    "to-cyan-400",
    "from-pink-500",
    "to-pink-400",
    "from-emerald-500",
    "to-emerald-400",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
        xl: "3rem",
      },
    },
    extend: {
      colors: {
        background: "#0f172a",
        foreground: "#f8fafc",
        surface: {
          DEFAULT: "#1e293b",
          hover: "#334155",
        },
        slate: {
          950: "#020617",
        },
        accent: {
          cyan: "#06b6d4",
          pink: "#ec4899",
          green: "#10b981",
        },
        primary: {
          DEFAULT: "#4f46e5",
          foreground: "#f8fafc",
          dark: "#3730a3",
        },
        secondary: {
          DEFAULT: "#7c3aed",
          foreground: "#f5f3ff",
        },
        muted: {
          DEFAULT: "#94a3b8",
          foreground: "#cbd5e1",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glow: "0 0 30px rgba(124, 58, 237, 0.35)",
        brand: "0 12px 40px rgba(79, 70, 229, 0.3)",
      },
      backgroundImage: {
        grid: "linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulse: {
          "0%, 100%": { boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)" },
          "50%": { boxShadow: "0 4px 20px rgba(79, 70, 229, 0.5)" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(30px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        pulse: "pulse 2s infinite",
        "fade-in-up": "fadeInUp 0.8s ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
