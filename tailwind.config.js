const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { bg: c('bg'), panel: c('panel'), ink: c('ink'), mute: c('mute'), cy: c('cy'), tq: c('tq'), gn: c('gn'), am: c('am'), rd: c('rd') },
      fontFamily: { digi: ['Orbitron', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
