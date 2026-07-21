import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/queries', () => ({
  useNotifications: () => ({ data: [] }),
  useProjects: () => ({ data: [{ id: 'p1', name: 'Serie X', color: '#FAC51C', task_count: 3 }] }),
}))

// token con name/role
function makeToken() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'ed@imasd.test', name: 'Edwin Cano', role: 'admin' })}.sig`
}

beforeEach(() => localStorage.setItem('idled_token', makeToken()))

import Sidebar from '@/components/Sidebar'

function renderSidebar() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><Sidebar /></QueryClientProvider>)
}

describe('Sidebar', () => {
  it('lista proyectos con contador', () => {
    renderSidebar()
    expect(screen.getByText('Serie X')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })
  it('muestra la ficha de usuario desde el token', () => {
    renderSidebar()
    expect(screen.getByText('Edwin Cano')).toBeTruthy()
  })
})
