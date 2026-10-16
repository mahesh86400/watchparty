import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Loading…</div>
  }
  if (!user) {
    // Remember where they wanted to go, so Login can send them back
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}