import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export default function AuthCard({
  title, subtitle, fields, submitLabel,
  footerText, footerLink, footerLabel,
  onSubmit, error, loading,
}) {
  const handleSubmit = (e) => {
    e.preventDefault()
    const values = Object.fromEntries(new FormData(e.currentTarget))
    onSubmit(values)
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <div className="rounded-2xl border border-white/10 bg-ink-900 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              <label htmlFor={f.name} className="mb-1 block text-sm text-slate-300">{f.label}</label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                required
                minLength={f.minLength}
                autoComplete={f.autoComplete}
                placeholder={f.placeholder}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none transition placeholder:text-slate-500 focus:border-indigo-400"
              />
            </div>
          ))}

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 py-2.5 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {footerText}{' '}
          <Link to={footerLink} className="text-indigo-400 hover:underline">{footerLabel}</Link>
        </p>
      </div>
    </div>
  )
}