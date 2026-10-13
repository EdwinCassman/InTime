import { useEffect, useState, type FormEvent } from 'react'
import { api, type Employee } from '../lib/api'

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)

  async function load() {
    try {
      setEmployees(await api.get<Employee[]>('/employees'))
    } catch {
      setError('Could not load employees.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showForm ? 'Close' : '+ Add employee'}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {showForm && (
        <NewEmployeeForm
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-4 py-2">{emp.name}</td>
                <td className="px-4 py-2 text-slate-500">{emp.email}</td>
                <td className="px-4 py-2">
                  <select
                    value={emp.role}
                    onChange={async (e) => {
                      await api.patch(`/employees/${emp.id}`, { role: e.target.value })
                      load()
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  {resetId === emp.id ? (
                    <ResetPasswordForm
                      employeeId={emp.id}
                      onDone={() => setResetId(null)}
                    />
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setResetId(emp.id)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Deactivate ${emp.name}?`)) return
                          await api.delete(`/employees/${emp.id}`)
                          load()
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ResetPasswordForm({ employeeId, onDone }: { employeeId: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/employees/${employeeId}/password`, { password })
      onDone()
    } catch {
      setError('Must be 8+ characters.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        type="password"
        autoFocus
        placeholder="New password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        onClick={submit}
        disabled={busy || password.length < 8}
        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Save
      </button>
      <button onClick={onDone} className="text-xs text-slate-500 hover:underline">
        Cancel
      </button>
    </div>
  )
}

function NewEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/employees', { name, email, password, role })
      onCreated()
    } catch {
      setError('Could not create employee. Check the email is unique and password is 8+ characters.')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EMPLOYEE')}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
      <div className="sm:col-span-4">
        <button
          type="submit"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save employee
        </button>
      </div>
    </form>
  )
}
