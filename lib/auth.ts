import { ApiError } from '@/lib/api'

const TOKEN_KEY = 'idled_token'

function erpBase(): string {
  return process.env.NEXT_PUBLIC_ERP_URL ?? 'http://localhost:8080'
}

export async function login(email: string): Promise<string> {
  const res = await fetch(`${erpBase()}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    throw new Error('Credenciales inválidas')
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function logout(reason?: 'expired'): void {
  if (typeof window === 'undefined') return
  clearToken()
  window.location.href = reason === 'expired' ? '/login?expired=1' : '/login'
}

export function onAuthError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    logout('expired')
  }
}

export interface TokenPayload {
  sub: string
  name: string | null
  role: string | null
}

export function decodeToken(token: string | null): TokenPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary')
    const payload = JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>
    if (typeof payload.sub !== 'string') return null
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      role: typeof payload.role === 'string' ? payload.role : null,
    }
  } catch {
    return null
  }
}
