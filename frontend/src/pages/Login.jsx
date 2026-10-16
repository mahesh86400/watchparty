import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async ({ email, password }) => {
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate(state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to join or create a watch room."
        fields={[
          { name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••', autoComplete: 'current-password' },
        ]}
        submitLabel="Sign in"
        footerText="New here?"
        footerLink="/register"
        footerLabel="Create an account"
        onSubmit={handleSubmit}
        error={error}
        loading={loading}
      />
    </>
  )
}