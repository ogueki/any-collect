import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chatStore'
import { useAppStore } from '../../store/appStore'

/**
 * ホームの会話UI（STEP2・最小機能）。
 * メッセージ一覧＋入力欄＋送信ボタン。送信中は入力を無効化し「考え中…」を表示する。
 * レイアウトの作り込みは後続（UI-NOTES 参照）。
 */
export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const error = useChatStore((s) => s.error)
  const send = useChatStore((s) => s.send)
  const characterId = useAppStore((s) => s.characterId)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const sending = status === 'sending'

  // 新着メッセージ・状態変化で最下部へスクロール。
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  const handleSend = () => {
    if (!input.trim() || sending) return
    void send(input, characterId)
    setInput('')
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div
        ref={listRef}
        className="flex h-64 flex-col gap-2 overflow-y-auto rounded-2xl bg-white/60 p-3"
      >
        {messages.length === 0 && (
          <p className="m-auto text-sm text-slate-400">妖精に話しかけてみよう</p>
        )}
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
          </div>
        ))}
        {sending && (
          <div className="self-start rounded-2xl bg-white px-3 py-2 text-sm text-slate-400 shadow-pop">
            考え中…
          </div>
        )}
      </div>

      {error && <p className="px-1 text-xs text-peach">{error}</p>}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 日本語入力（IME）の変換確定 Enter では送信しない。
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={sending}
          placeholder="メッセージを入力"
          aria-label="メッセージ入力"
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-lavender disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="rounded-full bg-lavender px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
        >
          送信
        </button>
      </div>
    </div>
  )
}
