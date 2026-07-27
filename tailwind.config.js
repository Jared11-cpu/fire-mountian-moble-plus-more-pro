/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        sans: ['"HarmonyOS Sans SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      colors: {
        river: '#1F6B72',
        ink: '#152F35',
        jade: '#4A987A',
        tower: '#BF573D',
        mist: '#EEF3ED',
        night: '#0B1C21',
      },
      boxShadow: {
        soft: '0 24px 70px rgba(21, 47, 53, 0.14)',
        glow: '0 18px 60px rgba(74, 152, 122, 0.24)',
      },
      backgroundImage: {
        'river-grid':
          'linear-gradient(rgba(31,107,114,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,107,114,0.08) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
