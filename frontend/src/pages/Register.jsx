import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async ({ name, email, password }) => {
    setError('')
    setLoading(true)
    try {
      await register(name, email, password)
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
        title="Create your account"
        subtitle="It takes less than a minute."
        fields={[
          { name: 'name', label: 'Name', type: 'text', placeholder: 'Your name', autoComplete: 'name' },
          { name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', placeholder: 'At least 8 characters', minLength: 8, autoComplete: 'new-password' },
        ]}
        submitLabel="Sign up"
        footerText="Already have an account?"
        footerLink="/login"
        footerLabel="Sign in"
        onSubmit={handleSubmit}
        error={error}
        loading={loading}
      />
    </>
  )
}