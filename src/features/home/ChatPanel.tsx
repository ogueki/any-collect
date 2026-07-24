import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chatStore'
import { useAppStore } from '../../store/appStore'
import { useMemoryStore } from '../../store/memoryStore'
import { speak, primeAudio } from '../../lib/audio/useSpeak'
import { SoundOnIcon, SendIcon } from '../../components/icons'
import { debugTools } from '../../lib/debug'

/**
 * ホームの会話UI（リデザイン）。**最新の返事はホーム中央の大セリフ**に出るので、
 * ここは「入力」を主役にし、会話ログ＋記憶パネルは**ボトムシート**（MenuSheet と同型）に格納
 * ＝ホームを1画面固定に保つ（通常フローに縦に伸びる要素を置かない）。
 * 記憶パネル（何を覚えているかの一覧＋「忘れる」）はユーザー向け＝プライバシー方針「エクスポート・削除は
 * 一級機能」の入口。手動要約の「いま覚えて」だけが検証用で、`?debug=1` のときに出る（`lib/debug.ts`）。
 */
export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const error = useChatStore((s) => s.error)
  const send = useChatStore((s) => s.send)
  const clearError = useChatStore((s) => s.clearError)
  const resetChat = useChatStore((s) => s.reset)
  const debugAgeHistory = useChatStore((s) => s.debugAgeHistory)
  const consolidateMemoryNow = useChatStore((s) => s.consolidateMemoryNow)
  const characterId = useAppStore((s) => s.characterId)
  const facts = useMemoryStore((s) => s.facts)
  const consolidating = useMemoryStore((s) => s.consolidating)
  const forget = useMemoryStore((s) => s.forget)

  const [input, setInput] = useState('')
  const [showLog, setShowLog] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const sending = status === 'sending'

  // ログを開いているときだけ最下部へスクロール。
  useEffect(() => {
    if (!showLog) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status, showLog])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    primeAudio() // 送信タップ（ユーザー操作）内で音声再生をアンロックしておく
    // 送れたときだけ入力を消す（失敗したら打ち直さずにもう一度送れる）。
    if (await send(input, characterId)) setInput('')
  }

  return (
    <div className="flex w-full max-w-md shrink-0 flex-col gap-2">
      {/* 入力バー（主役）。会話はここから。最新の返事はホーム中央の大セリフに出る。 */}
      <div className="flex gap-2">
        {/* 文字サイズは text-base(16px) 以上。iOS Safari は 16px 未満の input にフォーカスすると自動ズームしてしまう。 */}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            clearError() // 打ち直したらエラー表示は引っ込める
          }}
          onKeyDown={(e) => {
            // 日本語入力（IME）の変換確定 Enter では送信しない。
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleSend()
            }
          }}
          disabled={sending}
          placeholder="コレットに話しかける…"
          aria-label="メッセージ入力"
          className="flex-1 rounded-full border border-slate-200 bg-white/90 px-4 py-2.5 text-base outline-none focus:border-lavender disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          aria-label="送信"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lavender text-white shadow-pop transition active:scale-95 disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="px-1 text-xs text-peach">{error}</p>}

      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="self-center rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-slate-500 transition active:scale-95"
        >
          これまでの会話を見る（{messages.length}）
        </button>
      )}

      {/* 会話ログ＋記憶パネル＝ボトムシート（MenuSheet と同型）。 */}
      <div
        onClick={() => setShowLog(false)}
        aria-hidden={!showLog}
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${
          showLog ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-label="これまでの会話"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-white px-4 pb-7 pt-3 shadow-pop transition-transform duration-300 ${
          showLog ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-slate-700">これまでの会話</h2>
          {/* 会話は端末に残る（STEP2e）ので、消す手段もユーザーの手に置く（spec §9）。 */}
          <div className="flex gap-1.5">
            {debugTools() && (
              <button
                type="button"
                onClick={() => debugAgeHistory(24)}
                disabled={messages.length === 0}
                title="履歴を24時間前にずらす（リロードで「おかえり」を確認）"
                className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
              >
                1日前にする
              </button>
            )}
            <button
              type="button"
              onClick={resetChat}
              disabled={sending || messages.length === 0}
              className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-400 transition active:scale-95 disabled:opacity-40"
            >
              会話を消す
            </button>
          </div>
        </div>
        <div
          ref={listRef}
          className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto rounded-2xl bg-slate-50 p-3"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${
                m.role === 'user'
                  ? 'self-end bg-lavender text-white'
                  : 'self-start bg-white text-slate-700 shadow-pop'
              }`}
            >
              {m.content}
              {m.role !== 'user' && (
                <button
                  type="button"
                  onClick={() => void speak(m.content, { expression: m.emotion })}
                  aria-label="声で聞く"
                  title="声で聞く"
                  className="ml-1 inline-flex align-middle text-slate-400 transition hover:text-lavender active:scale-95"
                >
                  <SoundOnIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {sending && (
            <div className="self-start rounded-2xl bg-white px-3 py-2 text-sm text-slate-400 shadow-pop">
              考え中…
            </div>
          )}
        </div>

        {/* コレットが覚えていること（数往復ごとに会話から自動で要約されて増える）。
            一覧と「忘れる」はユーザー向け。「いま覚えて」（手動要約）は検証用＝`?debug=1` のときだけ。 */}
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-left">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">💭 コレットが覚えていること</span>
            <div className="flex gap-1.5">
              {debugTools() && (
                <button
                  type="button"
                  onClick={() => void consolidateMemoryNow()}
                  disabled={consolidating}
                  className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
                >
                  {consolidating ? '覚え中…' : 'いま覚えて'}
                </button>
              )}
              <button
                type="button"
                onClick={forget}
                disabled={consolidating || facts.length === 0}
                className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-400 transition active:scale-95 disabled:opacity-40"
              >
                忘れる
              </button>
            </div>
          </div>
          {facts.length === 0 ? (
            <p className="text-[11px] text-slate-400">まだ何も覚えていないよ（話しかけると覚えていくよ）</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {facts.map((f, i) => (
                <li key={`${f.key}-${i}`} className="text-[11px] text-slate-600">
                  <span className="font-bold text-lavender">{f.key}</span>：{f.value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
