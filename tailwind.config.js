/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: '#6EE7B7',
        lavender: '#C4B5FD',
        peach: '#FDA4AF',
        lemon: '#FDE68A',
      },
      fontFamily: {
        sans: ['"Zen Maru Gothic"', '"M PLUS Rounded 1c"', 'sans-serif'],
        display: ['Fredoka', '"Zen Maru Gothic"', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 8px 24px -8px rgba(196, 181, 253, 0.6)',
      },
    },
  },
  plugins: [],
}
