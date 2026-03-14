/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      colors: {
        brand: {
          50:  '#fdf8f0',
          100: '#f9edd5',
          200: '#f1d5a0',
          300: '#e8b96b',
          400: '#df9c3e',
          500: '#c4801f',
          600: '#a06318',
          700: '#7c4b14',
          800: '#5c3610',
          900: '#3e240b',
        },
        surface: {
          950: '#0a0d12',
          900: '#0f1318',
          800: '#161b24',
          700: '#1e2635',
          600: '#263042',
          500: '#2f3b50',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
