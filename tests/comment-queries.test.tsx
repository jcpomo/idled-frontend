import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useComments loads comments via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listComments').mockResolvedValue([] as never)
  const { result } = renderHook(() => useComments('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useCreateComment posts content via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'createComment').mockResolvedValue({} as never)
  const { result } = renderHook(() => useCreateComment('t1'), { wrapper: wrapper() })
  result.current.mutate('hola')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', 'hola'))
})

it('useUpdateComment patches content via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'updateComment').mockResolvedValue({} as never)
  const { result } = renderHook(() => useUpdateComment('t1'), { wrapper: wrapper() })
  result.current.mutate({ commentId: 'c1', content: 'editado' })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'c1', 'editado'))
})

it('useDeleteComment deletes via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'deleteComment').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useDeleteComment('t1'), { wrapper: wrapper() })
  result.current.mutate('c1')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'c1'))
})
