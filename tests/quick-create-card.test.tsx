import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const createMutate = vi.fn()
vi.mock('@/lib/queries', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'Serie X', color: '#FAC51C' }] }),
  useTaskTypes: () => ({ data: [
    { id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM', 'RFQ'], position: 0 },
    { id: 't2', name: 'MUESTRAS', color: '#FF7F24', subtasks: ['Req'], position: 1 },
  ] }),
  useQuickCreateTask: () => ({ mutate: createMutate, isPending: false }),
}))

import QuickCreateCard from '@/components/dashboard/QuickCreateCard'
function renderCard() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><QuickCreateCard /></QueryClientProvider>)
}
beforeEach(() => createMutate.mockClear())

describe('QuickCreateCard', () => {
  it('previsualiza las subtareas del tipo seleccionado', () => {
    renderCard()
    // PPTO es el primer tipo → su plantilla se previsualiza
    expect(screen.getByText('BOM')).toBeTruthy()
    expect(screen.getByText('RFQ')).toBeTruthy()
  })
  it('crea la tarea con task_type y subtasks', () => {
    renderCard()
    fireEvent.change(screen.getByLabelText('título de la tarea'), { target: { value: 'Presupuesto ACME' } })
    fireEvent.click(screen.getByRole('button', { name: /crear tarea/i }))
    expect(createMutate).toHaveBeenCalled()
    const arg = createMutate.mock.calls[0][0]
    expect(arg.projectId).toBe('p1')
    expect(arg.title).toBe('Presupuesto ACME')
    expect(arg.task_type).toBe('PPTO')
    expect(arg.subtasks).toEqual(['BOM', 'RFQ'])
  })
})
