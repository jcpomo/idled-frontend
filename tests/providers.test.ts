import { it, expect, beforeEach, afterEach } from 'vitest'
import { makeQueryClient } from '@/app/providers'
import { ApiError } from '@/lib/api'

let original: Location
beforeEach(() => {
  original = window.location
  Object.defineProperty(window, 'location', {
    value: { href: '', search: '' }, writable: true, configurable: true,
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
})

it('query cache logs out on a 401', () => {
  const qc = makeQueryClient()
  qc.getQueryCache().config.onError?.(new ApiError('x', 401), {} as never)
  expect(window.location.href).toBe('/login?expired=1')
})

it('mutation cache logs out on a 401', () => {
  const qc = makeQueryClient()
  qc.getMutationCache().config.onError?.(new ApiError('x', 401), undefined, undefined, {} as never)
  expect(window.location.href).toBe('/login?expired=1')
})

it('ignores a non-401 error', () => {
  const qc = makeQueryClient()
  qc.getQueryCache().config.onError?.(new ApiError('x', 500), {} as never)
  expect(window.location.href).toBe('')
})
