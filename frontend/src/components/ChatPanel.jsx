import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

const MAX_LENGTH = 500

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function ChatPanel({ messages = [], onSend, connected, currentUserId }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const clean = text.trim()
    if (!clean || sending) return

    setError('')
    setSending(true)
    try {
      await onSend(clean)
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-2xl border border-white/10 bg-ink-900">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold">Live chat</h2>
        <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-amber-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-slate-500">No messages yet. Say hi 👋</p>
        )}
        {messages.map((m) => (
          <div key={m._id}>
            <div className="flex items-baseline gap-2">
              <span className={`text-sm font-medium ${m.senderId === currentUserId ? 'text-violet-300' : 'text-indigo-300'}`}>
                {m.senderId === currentUserId ? 'You' : m.senderName}
              </span>
              <span className="text-[11px] text-slate-500">{formatTime(m.createdAt)}</span>
            </div>
            {/* React escapes this text, so it is never rendered as HTML */}
            <p className="break-words text-sm text-slate-200">{m.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="mx-3 mb-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{error}</p>
      )}

      <form onSubmit={handleSend} className="flex gap-2 border-t border-white/5 p-3">
        <input
          id="chat-message"
          name="chat-message"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LENGTH}
          disabled={!connected}
          placeholder={connected ? 'Send a message' : 'Connecting to chat…'}
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!connected || sending}
          aria-label="Send message"
          className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500 transition hover:bg-indigo-400 disabled:opacity-60"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  )
}