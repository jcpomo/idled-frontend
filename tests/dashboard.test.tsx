import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/dates', async (orig) => ({ ...(await orig() as object), todayISO: () => '2026-07-21' }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig() as object),
  getToken: () => 'h.p.s', decodeToken: () => ({ sub: 'ed', name: 'Edwin', role: 'admin' }) }))
vi.mock('@/lib/queries', () => ({
  useMyTasks: () => ({ data: [
    { id: '1', title: 'Hoy', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-21', subtask_done: 0, subtask_total: 0 },
    { id: '2', title: 'Vieja', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-01', subtask_done: 0, subtask_total: 0 },
  ], isError: false }),
  useProjects: () => ({ data: [
    { id: 'p1', name: 'Serie X', color: '#FF7F24', task_count: 4, done_count: 1 },
    { id: 'p2', name: 'Ajeno', color: '#FAC51C', task_count: 0, done_count: 0, is_owner: false },
  ], isLoading: false }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useTaskTypes: () => ({ data: [{ id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM'], position: 0 }], isError: false }),
  useQuickCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTaskType: () => ({ mutate: vi.fn(), isPending: false }),
}))

import Dashboard from '@/app/(app)/dashboard/page'

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><Dashboard /></QueryClientProvider>)
}

describe('Dashboard', () => {
  it('saluda por nombre y muestra stats hoy/atrasadas', () => {
    renderPage()
    expect(screen.getByText(/Edwin/)).toBeTruthy()
    expect(screen.getByText(/1 tarea/)).toBeTruthy()
    expect(screen.getByText(/1 atrasada/)).toBeTruthy()
  })
  it('muestra tarjetas de proyecto con progreso y etiqueta compartido', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Serie X/ })).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ajeno/ })).toBeTruthy()
    expect(screen.getAllByText('compartido')).toHaveLength(1)
  })
  it('muestra crear tarea rápida y el gestor de tipos', () => {
    renderPage()
    expect(screen.getByText('Crear tarea rápida')).toBeTruthy()
    expect(screen.getByText('Tipos de tarea y plantillas de subtareas')).toBeTruthy()
  })
})
