import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useConversations, useMessages } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useConversations loads via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listConversations').mockResolvedValue([] as never)
  const { result } = renderHook(() => useConversations(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMessages loads a conversation via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useMessages('conv1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 'conv1')
})
