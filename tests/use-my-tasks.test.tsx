import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMyTasks } from '@/lib/queries'

beforeEach(() => { localStorage.setItem('idled_token', 'h.p.s') })

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useMyTasks', () => {
  it('devuelve mis tareas', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { id: '1', title: 'Mía', project_id: 'p1', project_name: 'Proj', status: 'open',
          due_date: '2026-07-21', subtask_done: 1, subtask_total: 2 },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useMyTasks(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0].title).toBe('Mía'))
  })
})
