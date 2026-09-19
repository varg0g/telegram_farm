/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0c0e14',
          800: '#141721',
          700: '#1c202e',
          600: '#272d40',
          500: '#383f58'
        }
      }
    },
  },
  plugins: [],
}
