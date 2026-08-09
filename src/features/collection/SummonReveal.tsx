import { useEffect } from 'react'

/**
 * 召喚で生まれたアイテムが「出現する瞬間」の演出（Ⅰ-5）。
 *
 * これまでは生成完了と同時に**白い結果カードがポップインするだけ**で、1日1個・
 * このアプリでいちばん高い行為（§4.3）に見合う見せ場が無かった。ここを
 * 「光が集まる → 弾ける → 現れる」の3拍にして"儀式"にする（spec §14）。
 *
 * ・**画像アセットを使わない**（CSS のみ）＝たからばこの背景と同じ「アート依存を作らない」方針。
 * ・**タップでスキップできる**（`TreasureOpening` と同じ流儀。毎回きっちり待たされない）。
 * ・`prefers-reduced-motion` なら**短く静かな版**にする（消さない＝下のコメント参照）。
 * ・アニメの定義は `tailwind.config.js`（`summon-*`）。方向は `--a`、開始時刻は
 *   `animationDelay` で散らす＝**等間隔に整列すると機械的に見える**ため粒ごとにずらす。
 */

/** 集まる光の粒の数（多いと"渦"になって重い・少ないと寂しい）。 */
const MOTES = 8
/** 散るきらめきの数。 */
const SPARKS = 10

/** 演出の合計。1日1個なので 1.5 秒は許容範囲だが、これ以上伸ばすと"待ち"になる。 */
const REVEAL_MS = 1500
/** 動きを減らす設定のときの長さ（出たことは分かるが、待たせない）。 */
const REDUCED_MS = 700

/** 演出の地（たからばこと同じ世界観の紫）。通常版と reduced 版で共有する。 */
const STAGE_BG =
  'radial-gradient(90% 60% at 50% 45%, rgba(76,29,149,0.65) 0%, rgba(30,27,75,0.98) 70%),' +
  'linear-gradient(160deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)'

/** 各パートの開始（秒）。モックで詰めた値。 */
const T = {
  flash: 0.42,
  ringA: 0.47,
  ringB: 0.6,
  emerge: 0.5,
  spark: 0.64,
}

/** 粒ごとの到着ゆらぎ（秒）。id から決定的に出す＝再レンダーで動かない。 */
function jitter(i: number, span: number): number {
  return (((i * 37) % 13) / 13 - 0.5) * span
}

export default function SummonReveal({
  imageUrl,
  name,
  onDone,
}: {
  imageUrl: string
  name: string
  onDone: () => void
}) {
  /**
   * 動きを減らす設定（iOS「視差効果を減らす」等）のときは、**演出を消すのではなく短く静かにする**。
   * ⚠️ 以前はここで `null` を返して即スキップしていたが、それだと**設定を入れている人には
   * 何も起きていないように見える**（実際、実機で「何も変わらない」という報告が出た）。
   * 動きを減らしたい人に必要なのは「無」ではなく「派手に動かないこと」。
   */
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  useEffect(() => {
    const done = setTimeout(onDone, reduced ? REDUCED_MS : REVEAL_MS)
    return () => clearTimeout(done)
  }, [reduced, onDone])

  if (reduced) {
    return (
      <div
        onPointerDown={onDone}
        className="fixed inset-0 z-30 flex items-center justify-center"
        style={{ background: STAGE_BG }}
      >
        <img src={imageUrl} alt={name} draggable={false} className="w-40 animate-reveal select-none" />
      </div>
    )
  }

  return (
    <div
      onPointerDown={onDone} // タップでスキップ
      className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden"
      style={{ background: STAGE_BG }}
    >
      {/* ① 外から中心へ集まる光の粒 */}
      {Array.from({ length: MOTES }, (_, i) => (
        <span
          key={`mote-${i}`}
          aria-hidden
          className="absolute h-[7px] w-[7px] animate-summon-gather rounded-full bg-white"
          style={{
            ['--a' as string]: `${(360 / MOTES) * i}deg`,
            animationDelay: `${jitter(i, 0.12)}s`,
            boxShadow: '0 0 8px 3px rgba(196,181,253,0.9)',
          }}
        />
      ))}

      {/* ② 中心の閃光 */}
      <span
        aria-hidden
        className="absolute h-56 w-56 animate-summon-flash rounded-full"
        style={{
          animationDelay: `${T.flash}s`,
          background:
            'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(221,214,254,0.7) 35%, rgba(255,255,255,0) 70%)',
        }}
      />

      {/* ③ 外へ広がる光の輪（2本ずらす＝1本だと"波紋"に見えない） */}
      <span
        aria-hidden
        className="absolute h-32 w-32 animate-summon-ring rounded-full border-2 border-violet-200/90"
        style={{ animationDelay: `${T.ringA}s` }}
      />
      <span
        aria-hidden
        className="absolute h-32 w-32 animate-summon-ring rounded-full border-2 border-emerald-200/75"
        style={{ animationDelay: `${T.ringB}s` }}
      />

      {/* ④ アイテムが現れる。`filter: drop-shadow` は使わない
          （合成レイヤー上で影が矩形化する＝TreasureOpening と同じ理由）。 */}
      <img
        src={imageUrl}
        alt={name}
        draggable={false}
        className="relative w-40 animate-summon-emerge select-none"
        style={{ animationDelay: `${T.emerge}s` }}
      />

      {/* ⑤ 散るきらめき */}
      {Array.from({ length: SPARKS }, (_, i) => (
        <span
          key={`spark-${i}`}
          aria-hidden
          className="absolute h-[5px] w-[5px] animate-summon-spark rounded-full bg-white"
          style={{
            ['--a' as string]: `${(360 / SPARKS) * i + 18}deg`,
            animationDelay: `${T.spark + jitter(i, 0.16)}s`,
            boxShadow: '0 0 6px 2px rgba(253,230,138,0.9)',
          }}
        />
      ))}
    </div>
  )
}
