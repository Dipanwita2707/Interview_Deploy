/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        verdict: {
          accepted: '#22c55e',
          wrong: '#ef4444',
          tle: '#f59e0b',
          mle: '#f97316',
          compile: '#8b5cf6',
          runtime: '#ec4899',
          pending: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
