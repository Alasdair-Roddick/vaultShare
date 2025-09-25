/** @type {import(''tailwindcss'').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#d7f8e3',
          200: '#b0efc8',
          300: '#7fe3a8',
          400: '#4cd487',
          500: '#24be6c',
          600: '#169455',
          700: '#117243',
          800: '#0f5a37',
          900: '#0d4a2f',
        },
      },
      boxShadow: {
        card: '0 10px 30px -15px rgba(15, 90, 55, 0.4)',
      },
    },
  },
  plugins: [],
}
