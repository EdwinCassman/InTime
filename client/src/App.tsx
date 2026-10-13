import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute'
import { Employees } from './pages/Employees'
import { Login } from './pages/Login'
import { RecurringSchedule } from './pages/RecurringSchedule'
import { Reports } from './pages/Reports'
import { Requests } from './pages/Requests'
import { Schedule } from './pages/Schedule'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/reports" element={<Reports />} />
          <Route element={<AdminRoute />}>
            <Route path="/employees" element={<Employees />} />
            <Route path="/recurring-schedule" element={<RecurringSchedule />} />
            <Route path="/requests" element={<Requests />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/schedule" replace />} />
    </Routes>
  )
}

export default App
