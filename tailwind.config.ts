import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // include config/constants files that may contain Tailwind class strings
    "./constants/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Ensure dynamically-generated class names in constants are preserved
  // (avatar gradients are defined in `constants/ui.ts` as class strings)
  safelist: [
    // blues
    "from-blue-500",
    "to-cyan-500",
    // purples
    "from-purple-500",
    "to-indigo-500",
    // greens
    "from-emerald-500",
    "to-teal-500",
    // neutrals
    "from-slate-500",
    "to-slate-600",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
