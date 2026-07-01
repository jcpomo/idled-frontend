import { describe, it, expect, vi, beforeEach } from 'vitest'
import { login, saveToken, getToken, clearToken } from '@/lib/auth'

beforeEach(() => {
  process.env.NEXT_PUBLIC_ERP_URL = 'http://erp'
  localStorage.clear()
  vi.restoreAllMocks()
})

it('login posts email and returns token', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'jwt-123' }) })
  vi.stubGlobal('fetch', fetchMock)
  const tok = await login('ana@idled.test')
  expect(tok).toBe('jwt-123')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://erp/api/login')
  expect(JSON.parse(init.body)).toEqual({ email: 'ana@idled.test' })
})

it('login throws on bad credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
  await expect(login('nope@x.test')).rejects.toThrow()
})

it('token store roundtrip', () => {
  expect(getToken()).toBeNull()
  saveToken('abc')
  expect(getToken()).toBe('abc')
  clearToken()
  expect(getToken()).toBeNull()
})
