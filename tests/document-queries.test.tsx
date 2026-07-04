import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as documents from '@/lib/documents'
import * as auth from '@/lib/auth'
import { useDocuments, useUploadDocument } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useDocuments loads via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listDocuments').mockResolvedValue([] as never)
  const { result } = renderHook(() => useDocuments(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useUploadDocument uploads via the helper with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(documents, 'uploadDocument').mockResolvedValue({ document_id: 'd1', status: 'uploaded' })
  const { result } = renderHook(() => useUploadDocument(), { wrapper: wrapper() })
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  result.current.mutate(file)
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', file))
})
