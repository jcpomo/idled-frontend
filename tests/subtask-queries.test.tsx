import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useTask, useSubtasks, useCreateSubtask } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useTask fetches a single task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'getTask').mockResolvedValue({ id: 't1' } as never)
  const { result } = renderHook(() => useTask('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useSubtasks fetches children via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listSubtasks').mockResolvedValue([] as never)
  const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useCreateSubtask posts a subtask via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'createSubtask').mockResolvedValue({} as never)
  const { result } = renderHook(() => useCreateSubtask('t1'), { wrapper: wrapper() })
  result.current.mutate({ title: 'Hija' })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', { title: 'Hija' }))
})
