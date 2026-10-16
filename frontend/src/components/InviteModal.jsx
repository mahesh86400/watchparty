import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

export default function InviteModal({ open, onClose, link }) {
  const [copied, setCopied] = useState(false)
  if (!open) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Could not copy automatically. Please copy the link manually.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Invite friends"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invite friends</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-400">Anyone with this link can join the room.</p>

        <div className="mt-4 flex gap-2">
          <input
            readOnly
            value={link}
            aria-label="Invite link"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-slate-300"
          />
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}