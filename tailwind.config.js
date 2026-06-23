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
      // 妖精の生命感（実行時コストゼロのCSSアニメ）。
      // float = 常時のフワフワ浮遊 / それ以外 = リアクション時に1回だけ再生。
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-6deg)' },
          '75%': { transform: 'rotate(6deg)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
        droop: {
          '0%': { transform: 'translateY(0) scale(1)' },
          '100%': { transform: 'translateY(4px) scale(0.96)' },
        },
        // アイテム化結果が「ジャン！」と出てくるリビール演出（カード入場）。
        reveal: {
          '0%': { opacity: '0', transform: 'scale(0.85) translateY(10px)' },
          '60%': { opacity: '1', transform: 'scale(1.03) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        pop: 'pop 0.45s ease-out 1',
        wiggle: 'wiggle 0.5s ease-in-out 1',
        shake: 'shake 0.5s ease-in-out 1',
        droop: 'droop 0.5s ease-out 1 forwards',
        reveal: 'reveal 0.5s ease-out 1',
      },
    },
  },
  plugins: [],
}
