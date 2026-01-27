/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gold': '#FFD700',
        'dark-gray': '#2C2C2C',
        'charcoal': '#1A1A1A',
      },
    },
  },
  plugins: [],
}
