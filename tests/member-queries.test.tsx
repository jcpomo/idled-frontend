import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useUsers, useMembers, useAddMember, useRemoveMember } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useUsers loads the directory with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listUsers').mockResolvedValue([] as never)
  const { result } = renderHook(() => useUsers(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMembers loads a project team with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listMembers').mockResolvedValue([] as never)
  const { result } = renderHook(() => useMembers('p1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 'p1')
})

it('useAddMember posts a member with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'addMember').mockResolvedValue([] as never)
  const { result } = renderHook(() => useAddMember('p1'), { wrapper: wrapper() })
  result.current.mutate('ext-2')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1', 'ext-2'))
})

it('useRemoveMember deletes a member with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'removeMember').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useRemoveMember('p1'), { wrapper: wrapper() })
  result.current.mutate('ext-2')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1', 'ext-2'))
})
