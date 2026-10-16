import { socket } from '../services/socket'
import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // If a token is saved, we start in "loading" while we check it with the server
  const [loading, setLoading] = useState(Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return
    api
      .me()
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err.status === 401) clearToken() // token is invalid or expired
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const data = await api.login(email, password)
    setToken(data.token)
    setUser(data.user)
  }

  const register = async (name, email, password) => {
    const data = await api.register(name, email, password)
    setToken(data.token)
    setUser(data.user)
  }

   const logout = () => {
    socket.disconnect()
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}