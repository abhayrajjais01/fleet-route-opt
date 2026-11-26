// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
// A dialog from the account menu, or (required) the whole screen when the account still has a temporary password.
import { useState, type FormEvent } from 'react'
import { changePassword, SignInError, type Session } from '../../lib/session'

const MIN = 8

export default function ChangePassword({ session, required, onDone, onCancel }: {
  session: Extract<Session, { mode: 'user' }>; required?: boolean; onDone: (s: Session) => void; onCancel: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next.length < MIN) { setError(`Use at least ${MIN} characters.`); return }
    if (next === current) { setError('Choose a password you are not already using.'); return }
    if (next !== again) { setError('The two new passwords don’t match.'); return }
    setBusy(true); setError(null)
    try { onDone(await changePassword(session, current, next)) } catch (err) {
      setError(err instanceof SignInError ? err.message : 'The password was not changed. Please try again.')
      setBusy(false)
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <input id={id} type="password" autoComplete={autoComplete} value={value} onChange={e => set(e.target.value)} disabled={busy}
        className="mt-1.5 w-full rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60" />
    </div>
  )
  const form = (
    <form onSubmit={submit} noValidate className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 space-y-4" role={required ? undefined : 'dialog'} aria-labelledby="cp-title">
      <div>
        <h2 id="cp-title" className="text-lg font-bold text-slate-900">{required ? 'Choose your own password' : 'Change password'}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {required ? `You’re signed in as ${session.user.email} with a temporary password. Replace it to continue.` : 'You’ll stay signed in here. Every other device is signed out.'}
        </p>
      </div>
      <input type="text" autoComplete="username" value={session.user.email} readOnly hidden />
      {field('cp-current', required ? 'Temporary password' : 'Current password', current, setCurrent, 'current-password')}
      {field('cp-new', `New password (at least ${MIN} characters)`, next, setNext, 'new-password')}
      {field('cp-again', 'New password again', again, setAgain, 'new-password')}
      <p aria-live="polite" className={`text-sm text-red-700 ${error ? '' : 'sr-only'}`}>{error ?? ''}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">{required ? 'Sign out' : 'Cancel'}</button>
        <button type="submit" disabled={busy || !current || !next || !again} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{busy ? 'Saving…' : 'Change password'}</button>
      </div>
    </form>
  )
  return required
    ? <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>{form}</div>
    : <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">{form}</div>
}
