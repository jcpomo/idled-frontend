import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTaskTypes } from '@/lib/queries'

beforeEach(() => localStorage.setItem('idled_token', 'h.p.s'))
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useTaskTypes', () => {
  it('lista los tipos', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([{ id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM'], position: 0 }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useTaskTypes(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0].name).toBe('PPTO'))
  })
})
