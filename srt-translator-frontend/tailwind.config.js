// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          400: '#9ca3af',
        },
        red: {
          100: '#fee2e2',
          400: '#f87171',
        }
      }
    },
  },
  plugins: [],
}