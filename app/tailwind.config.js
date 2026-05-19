/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
        serif: ["Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
  safelist: ["transition-[width]", "w-[580px]", "grid-cols-2"],
};
