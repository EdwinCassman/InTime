import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, type ShiftClaimRequest, type TimeOffRequest } from '../lib/api'

const navItems = [
  { to: '/schedule', label: 'Schedule' },
  { to: '/recurring-schedule', label: 'Recurring Schedule', adminOnly: true },
  { to: '/reports', label: 'Reports' },
  { to: '/employees', label: 'Employees', adminOnly: true },
  { to: '/requests', label: 'Requests', adminOnly: true },
]

const PENDING_REQUESTS_POLL_MS = 30_000

function NavBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
      {count}
    </span>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const visibleItems = navItems.filter((item) => !item.adminOnly || user?.role === 'ADMIN')

  useEffect(() => {
    if (user?.role !== 'ADMIN') return

    let cancelled = false
    async function loadPendingCount() {
      try {
        const [timeOff, claims] = await Promise.all([
          api.get<TimeOffRequest[]>('/time-off-requests?status=PENDING'),
          api.get<ShiftClaimRequest[]>('/shift-claim-requests?status=PENDING'),
        ])
        if (!cancelled) setPendingCount(timeOff.length + claims.length)
      } catch {
        // Silently ignore — the badge just won't update this cycle.
      }
    }

    loadPendingCount()
    const interval = setInterval(loadPendingCount, PENDING_REQUESTS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">InTime</span>
            <nav className="hidden gap-4 sm:flex">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`
                  }
                >
                  {item.label}
                  {item.to === '/requests' && <NavBadge count={pendingCount} />}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-3 text-sm text-slate-600 sm:flex">
            <span>
              {user?.name} <span className="text-slate-400">({user?.role})</span>
            </span>
            <button
              onClick={logout}
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="relative rounded border border-slate-300 p-2 sm:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              ) : (
                <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
              )}
            </svg>
            {!menuOpen && pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-200 px-4 py-3 sm:hidden">
            <nav className="flex flex-col gap-1">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded px-2 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600'}`
                  }
                >
                  {item.label}
                  {item.to === '/requests' && <NavBadge count={pendingCount} />}
                </NavLink>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-2 pt-3 text-sm text-slate-600">
              <span>
                {user?.name} <span className="text-slate-400">({user?.role})</span>
              </span>
              <button
                onClick={logout}
                className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
