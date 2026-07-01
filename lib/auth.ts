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
