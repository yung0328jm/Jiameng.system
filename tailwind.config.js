/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: '#FFD700',
        'dark-gray': '#252018',
        charcoal: '#14110e',
        cn: {
          ink: '#0f0c0a',
          lacquer: '#1c1512',
          panel: '#231c18',
          vermilion: '#b83226',
          gold: '#d4af37',
          'gold-dim': '#9a7b2c',
          parchment: '#f0e6d4',
          jade: '#2f6f5e',
          mist: '#8a8078',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif TC"', 'STSong', 'SimSun', 'serif'],
      },
    },
  },
  plugins: [],
}
