import { createContext, useContext, useState } from 'react'
import api from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hm_user') || 'null') } catch { return null }
  })

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('hm_token', data.token)
    localStorage.setItem('hm_user', JSON.stringify(data.user))
    setUser(data.user); return data.user
  }
  async function register(payload) {
    const { data } = await api.post('/auth/register', payload)
    localStorage.setItem('hm_token', data.token)
    localStorage.setItem('hm_user', JSON.stringify(data.user))
    setUser(data.user); return data.user
  }
  function logout() {
    localStorage.removeItem('hm_token'); localStorage.removeItem('hm_user'); setUser(null)
  }

  return <AuthCtx.Provider value={{ user, login, register, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
