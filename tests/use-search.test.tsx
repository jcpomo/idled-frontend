import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSearch } from '@/lib/queries'

beforeEach(() => {
  localStorage.setItem('idled_token', 'header.payload.sig')
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSearch', () => {
  it('no consulta con query corta', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const { result } = renderHook(() => useSearch('s'), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('devuelve resultados con query válida', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [{ id: '1', name: 'Serie X', color: '#FAC51C' }], tasks: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useSearch('serie'), { wrapper })
    await waitFor(() => expect(result.current.data?.projects[0].name).toBe('Serie X'))
  })
})
