/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe7ff', 200: '#bccff8', 300: '#8caef0',
          400: '#5685e3', 500: '#2f63d4', 600: '#1f4cb4', 700: '#1a3e93',
          800: '#173675', 900: '#142d5e',
        },
      },
      fontFamily: { sans: ['Outfit', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
