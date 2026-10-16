import { Link, useNavigate } from 'react-router-dom'
import { Clapperboard, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500">
            <Clapperboard size={18} />
          </span>
          WatchParty
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:block">Hi, {user.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
              Sign in
            </Link>
            <Link to="/register" className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}