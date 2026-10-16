import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, MessageCircle, Lock, PictureInPicture2, Users, Play } from 'lucide-react'
import Navbar from '../components/Navbar'

const features = [
  { icon: Play, title: 'Perfectly in sync', text: 'Play, pause and seek together. Everyone sees the same moment.' },
  { icon: Video, title: 'See every reaction', text: 'Live camera and mic so the laughs and gasps are shared.' },
  { icon: MessageCircle, title: 'Real-time chat', text: 'Chat alongside the movie without missing a scene.' },
  { icon: PictureInPicture2, title: 'Minimize your player', text: 'Shrink the movie just for you and keep the chat in focus.' },
  { icon: Lock, title: 'Owner controls', text: 'Lock playback so only the host decides when to pause.' },
  { icon: Users, title: 'Private rooms', text: 'Invite friends with a link. Rooms hold 4 to 8 people.' },
]

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const joinRoom = (e) => {
    e.preventDefault()
    const clean = code.trim()
    if (clean) navigate(`/room/${clean}`)
  }

  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-3xl" />
          <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
            <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
              Movie night, wherever you are
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-6xl">
              Watch together.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                Feel together.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-slate-400">
              Create a private room, share a link, and watch videos in sync while seeing and hearing your friends live.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/create"
                className="w-full rounded-xl bg-indigo-500 px-6 py-3 font-medium transition hover:bg-indigo-400 sm:w-auto"
              >
                Create Room
              </Link>
              <form onSubmit={joinRoom} className="flex w-full gap-2 sm:w-auto">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Room code"
                  aria-label="Room code"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-400 sm:w-40"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 bg-ink-800 px-5 py-3 font-medium transition hover:bg-ink-700"
                >
                  Join Room
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-ink-900 p-6 transition hover:border-indigo-400/40">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}