import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import { api } from '../services/api'

export default function CreateRoom() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [limit, setLimit] = useState(8)
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanName = name.trim()
    const cleanUrl = videoUrl.trim()
    if (cleanName.length < 3) {
      setError('Room name must be at least 3 characters.')
      return
    }
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      setError('Video URL must start with http:// or https://')
      return
    }

    setLoading(true)
    try {
      const data = await api.createRoom({
        name: cleanName,
        participantLimit: Number(limit),
        videoUrl: cleanUrl,
      })
      navigate(`/room/${data.room.roomId}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="mx-auto mt-12 w-full max-w-md px-4 pb-16">
        <div className="rounded-2xl border border-white/10 bg-ink-900 p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold">Create a room</h1>
          <p className="mt-1 text-sm text-slate-400">Set it up, then share the link with your friends.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-slate-300">Room name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Friday Movie Night"
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-400"
              />
            </div>

            <div>
              <label htmlFor="limit" className="mb-1 block text-sm text-slate-300">Participant limit</label>
              <select
                id="limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n} people</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="video" className="mb-1 block text-sm text-slate-300">
                Video URL <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="video"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://example.com/movie.mp4"
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-400"
              />
              <p className="mt-1 text-xs text-slate-500">Leave empty to use a sample video.</p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 py-2.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Create room
            </button>
          </form>
        </div>
      </div>
    </>
  )
}