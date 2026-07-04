'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, saveToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expired') === '1') setExpired(true)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const token = await login(email)
      saveToken(token)
      router.push('/dashboard')
    } catch {
      setError('No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <form onSubmit={onSubmit} style={{ width: 320, padding: 24, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <h1 style={{ fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>IMASD</h1>
        {expired && <p role="alert" style={{ color: 'var(--red)', marginBottom: 12 }}>Tu sesión ha caducado. Vuelve a entrar.</p>}
        <input
          aria-label="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
        />
        {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 10, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600 }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
