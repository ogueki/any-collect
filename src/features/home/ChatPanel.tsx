import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chatStore'
import { useAppStore } from '../../store/appStore'
import { useMemoryStore } from '../../store/memoryStore'
import { speak, primeAudio } from '../../lib/audio/useSpeak'
import { SoundOnIcon, SendIcon } from '../../components/icons'

/**
 * ホームの会話UI（リデザイン）。**最新の返事はホーム中央の大セリフ**に出るので、
 * ここは「入力」を主役にし、会話ログは控えめ（折りたたみ・既定は閉じる）。
 * 記憶パネルは検証用（TODO(verify)・将来ユーザー向け記憶管理UIに格上げしうる）。
 */
export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const error = useChatStore((s) => s.error)
  const send = useChatStore((s) => s.send)
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

  const handleSend = () => {
    if (!input.trim() || sending) return
    primeAudio() // 送信タップ（ユーザー操作）内で音声再生をアンロックしておく
    void send(input, characterId)
    setInput('')
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {/* 入力バー（主役）。会話はここから。最新の返事はホーム中央の大セリフに出る。 */}
      <div className="flex gap-2">
        {/* 文字サイズは text-base(16px) 以上。iOS Safari は 16px 未満の input にフォーカスすると自動ズームしてしまう。 */}
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
          placeholder="コレットに話しかける…"
          aria-label="メッセージ入力"
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-base outline-none focus:border-lavender disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          aria-label="送信"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lavender text-white shadow-pop transition active:scale-95 disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="px-1 text-xs text-peach">{error}</p>}

      {/* 会話履歴（控えめ・折りたたみ／既定は閉じる）。 */}
      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="self-center text-xs font-bold text-slate-400 transition active:scale-95"
        >
          {showLog ? '会話を閉じる' : `これまでの会話を見る（${messages.length}）`}
        </button>
      )}
      {showLog && (
        <div
          ref={listRef}
          className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-2xl bg-white/60 p-3"
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
                  onClick={() => void speak(m.content)}
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
      )}

      {/* コレットが覚えていること（会話・撮影・アイテム化で自然に増える）。
          TODO(verify): 「いま覚えて」「忘れる」は検証用。将来ユーザー向けの記憶管理UIに格上げしうる。 */}
      <div className="mt-1 rounded-2xl bg-white/60 p-3 text-left">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500">💭 コレットが覚えていること</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void consolidateMemoryNow()}
              disabled={consolidating}
              className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
            >
              {consolidating ? '覚え中…' : 'いま覚えて'}
            </button>
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
  )
}
