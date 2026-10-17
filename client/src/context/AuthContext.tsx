import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { api, type Role } from '../lib/api'

export interface AuthedUser {
  id: string
  username: string
  name: string
  role: Role
}

interface AuthContextValue {
  user: AuthedUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function loadStoredUser(): AuthedUser | null {
  const raw = localStorage.getItem('intime_user')
  return raw ? (JSON.parse(raw) as AuthedUser) : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(() => loadStoredUser())

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(username: string, password: string) {
        const res = await api.post<{ token: string; user: AuthedUser }>('/auth/login', {
          username,
          password,
        })
        localStorage.setItem('intime_token', res.token)
        localStorage.setItem('intime_user', JSON.stringify(res.user))
        setUser(res.user)
      },
      logout() {
        localStorage.removeItem('intime_token')
        localStorage.removeItem('intime_user')
        setUser(null)
      },
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
