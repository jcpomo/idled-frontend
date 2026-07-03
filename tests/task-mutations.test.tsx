import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useUpdateTask, useDeleteTask } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useUpdateTask patches the task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'updateTask').mockResolvedValue({} as never)
  const { result } = renderHook(() => useUpdateTask('p1'), { wrapper: wrapper() })
  result.current.mutate({ taskId: 't1', patch: { description: 'x' } })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', { description: 'x' }))
})

it('useDeleteTask deletes the task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'deleteTask').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useDeleteTask('p1'), { wrapper: wrapper() })
  result.current.mutate({ taskId: 't1' })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1'))
})
