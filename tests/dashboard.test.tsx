import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as queries from '@/lib/queries'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
beforeEach(() => vi.restoreAllMocks())

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

it('lists projects from the hook', async () => {
  vi.spyOn(queries, 'useProjects').mockReturnValue({ data: [{ id: 'p1', name: 'Serie X' }], isLoading: false } as any)
  vi.spyOn(queries, 'useCreateProject').mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
  const { default: Dashboard } = await import('@/app/(app)/dashboard/page')
  wrap(<Dashboard />)
  expect(await screen.findByText('Serie X')).toBeInTheDocument()
})
