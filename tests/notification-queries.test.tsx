import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

it('useNotifications loads the list with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listNotifications').mockResolvedValue([] as never)
  const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(client()) })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMarkNotificationRead marks one and invalidates notifications', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'markNotificationRead').mockResolvedValue({ ok: true } as never)
  const qc = client()
  const inv = vi.spyOn(qc, 'invalidateQueries')
  const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: wrapper(qc) })
  result.current.mutate('n1')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'n1'))
  await waitFor(() => expect(inv).toHaveBeenCalledWith({ queryKey: ['notifications'] }))
})

it('useMarkAllNotificationsRead marks all and invalidates notifications', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'markAllNotificationsRead').mockResolvedValue({ marked: 3 } as never)
  const qc = client()
  const inv = vi.spyOn(qc, 'invalidateQueries')
  const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: wrapper(qc) })
  result.current.mutate()
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok'))
  await waitFor(() => expect(inv).toHaveBeenCalledWith({ queryKey: ['notifications'] }))
})
