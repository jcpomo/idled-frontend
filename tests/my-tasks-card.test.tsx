import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/lib/dates', async (orig) => ({ ...(await orig()), todayISO: () => '2026-07-21' }))
vi.mock('@/lib/queries', () => ({
  useMyTasks: () => ({ data: [
    { id: '1', title: 'Hoy', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-21', subtask_done: 1, subtask_total: 2 },
    { id: '2', title: 'Atrasada', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-01', subtask_done: 0, subtask_total: 0 },
  ], isError: false }),
}))

import MyTasksCard from '@/components/dashboard/MyTasksCard'

function renderCard() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><MyTasksCard /></QueryClientProvider>)
}

beforeEach(() => pushMock.mockClear())

describe('MyTasksCard', () => {
  it('lista mis tareas y filtra por Atrasadas', () => {
    renderCard()
    expect(screen.getByText('Hoy', { selector: 'div' })).toBeTruthy()
    expect(screen.getByText('Atrasada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Atrasadas' }))
    expect(screen.queryByText('Hoy', { selector: 'div' })).toBeNull()
    expect(screen.getByText('Atrasada')).toBeTruthy()
  })
  it('click en una fila navega al proyecto', () => {
    renderCard()
    fireEvent.click(screen.getByText('Hoy', { selector: 'div' }))
    expect(pushMock).toHaveBeenCalledWith('/project/p1')
  })
})
