import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/schedule" replace />
  return <Outlet />
}
