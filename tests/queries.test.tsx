import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useProjects } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useProjects loads projects via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(api, 'listProjects').mockResolvedValue([{ id: 'p1', name: 'Serie X' }])
  const { result } = renderHook(() => useProjects(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(result.current.data![0].name).toBe('Serie X')
  expect(api.listProjects).toHaveBeenCalledWith('tok')
})
