import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))

import Topbar from '@/components/Topbar'

beforeEach(() => {
  localStorage.setItem('idled_token', 'header.payload.sig')
  vi.spyOn(global, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ projects: [{ id: '1', name: 'Serie X', color: '#FAC51C' }], tasks: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
})

function renderTopbar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Topbar /></QueryClientProvider>)
}

describe('Topbar', () => {
  it('muestra el breadcrumb y el botón Nueva tarea', () => {
    renderTopbar()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeTruthy()
  })

  it('busca y muestra resultados al escribir', async () => {
    renderTopbar()
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'serie' } })
    await waitFor(() => expect(screen.getByText('Serie X')).toBeTruthy())
  })
})
