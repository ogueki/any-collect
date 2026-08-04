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
        // 図鑑（標本の台紙）だけで使う紙の色。ほかの画面は従来のパステル＋白のまま＝
        // 「図鑑は別の場所」を色で伝える（spec §10）。
        // ⚠️ 紙は**周囲より濃く**する。body の背景グラデ（#fdf4ff〜#ecfdf5）はほぼ白なので、
        // 白っぽい紙（旧 #FBF6EC）ではコントラスト比 1.00＝「紙が置かれている」ことすら見えない。
        paper: '#F3E9D2',
        // 標本1件ごとに敷く「もう1枚の紙」。台紙よりわずかに明るいことで、写真が
        // ページに直接置かれるのでなく**紙の上に貼られている**ように見える（ここが効く）。
        paperCard: '#FAF3E3',
        paperEdge: '#D9C9A8',
        ink: '#4A3F32',
      },
      fontFamily: {
        sans: ['"Zen Maru Gothic"', '"M PLUS Rounded 1c"', 'sans-serif'],
        display: ['Fredoka', '"Zen Maru Gothic"', 'sans-serif'],
        // 図鑑だけ別の書体にして「場所が違う」ことを字でも出す。
        // ⚠️ **明朝でないと効かない**。既定の sans が丸ゴシック（Zen Maru Gothic）なので、
        // 同じ丸ゴシック系（旧 M PLUS Rounded 1c）を当てても並べたとき差が出ない＝「別の場所」にならない。
        zukan: ['"Shippori Mincho"', 'serif'],
      },
      boxShadow: {
        pop: '0 8px 24px -8px rgba(196, 181, 253, 0.6)',
        // 紙の「厚み」＝浮かせずに下だけへ1本。cozy の pop をそのまま使うとカードが浮いて紙に見えない。
        paper: '0 1px 0 #E3D3B4, 0 2px 3px rgba(74, 63, 50, 0.10)',
        // 台紙そのもの＝縁の線＋内側に落とす影。inset で中央をわずかに明るく残すと「紙の面」に見える
        // （外へ広げる影を足すと浮いた"カード"になってしまう）。
        sheet: '0 0 0 1px #D9C9A8, inset 0 0 60px rgba(160, 135, 95, 0.18)',
        // 紙に貼った標本＝白フチ（マット）の下に落ちる小さな影。
        specimen: '0 1px 3px rgba(74, 63, 50, 0.30)',
        // 台紙の上に置いた1枚（標本カード）。浮かせすぎない。
        card: '0 2px 5px rgba(74, 63, 50, 0.16)',
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
        // たからばこの中でアイテムがゆっくり漂う（周期/位相はアイテムごとにインラインで散らす）。
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '25%': { transform: 'translate(5px, -7px) rotate(2deg)' },
          '50%': { transform: 'translate(0, -11px) rotate(0deg)' },
          '75%': { transform: 'translate(-5px, -6px) rotate(-2deg)' },
        },
        // たからばこの星屑のまたたき。
        twinkle: {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '0.9' },
        },
        // 撮影で貯まった「＋まほうパワー / なつき」がふわっと上がって消える。
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.9)' },
          '18%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-26px) scale(1)' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        pop: 'pop 0.45s ease-out 1',
        wiggle: 'wiggle 0.5s ease-in-out 1',
        shake: 'shake 0.5s ease-in-out 1',
        droop: 'droop 0.5s ease-out 1 forwards',
        reveal: 'reveal 0.5s ease-out 1',
        rise: 'rise 1.4s ease-out 1 forwards',
        // 秒数はインライン style で上書きする前提のデフォルト。
        drift: 'drift 8s ease-in-out infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
