/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: '#7ee0d2',
        'dark-gray': '#0f2a38',
        charcoal: '#06151f',
        cn: {
          ink: '#061820',
          lacquer: '#0a2838',
          panel: '#113948',
          vermilion: '#e05d4c',
          gold: '#7fd4c8',
          'gold-dim': '#3d9a8e',
          parchment: '#e6f4f2',
          jade: '#2a9d8f',
          mist: '#8fb3c0',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif TC"', 'STSong', 'SimSun', 'serif'],
      },
    },
  },
  plugins: [],
}
