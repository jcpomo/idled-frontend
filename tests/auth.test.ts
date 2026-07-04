import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { login, saveToken, getToken, clearToken, logout, onAuthError } from '@/lib/auth'
import { ApiError } from '@/lib/api'

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

describe('logout / onAuthError', () => {
  let original: Location
  beforeEach(() => {
    original = window.location
    Object.defineProperty(window, 'location', {
      value: { href: '', search: '' }, writable: true, configurable: true,
    })
    localStorage.setItem('idled_token', 'tok')
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('logout clears the token and navigates to /login', () => {
    logout()
    expect(localStorage.getItem('idled_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it("logout('expired') navigates to /login?expired=1", () => {
    logout('expired')
    expect(window.location.href).toBe('/login?expired=1')
  })

  it('onAuthError logs out on an ApiError 401', () => {
    onAuthError(new ApiError('x', 401))
    expect(localStorage.getItem('idled_token')).toBeNull()
    expect(window.location.href).toBe('/login?expired=1')
  })

  it('onAuthError ignores a non-401 ApiError and plain errors', () => {
    onAuthError(new ApiError('x', 500))
    onAuthError(new Error('boom'))
    expect(localStorage.getItem('idled_token')).toBe('tok')
    expect(window.location.href).toBe('')
  })
})
