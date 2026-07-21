import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const updateMutate = vi.fn()
const TYPES = [
  { id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM', 'RFQ'], position: 0 },
  { id: 't2', name: 'MUESTRAS', color: '#FF7F24', subtasks: ['Requisitos'], position: 1 },
]
vi.mock('@/lib/queries', () => ({
  useTaskTypes: () => ({ data: TYPES, isError: false }),
  useCreateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTaskType: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTaskType: () => ({ mutate: vi.fn(), isPending: false }),
}))
const authState = vi.hoisted(() => ({ role: 'admin' as string }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig() as object), getToken: () => 'h.p.s', decodeToken: () => ({ sub: 'u', name: 'U', role: authState.role }) }))

import TaskTypesManager from '@/components/dashboard/TaskTypesManager'
function renderMgr() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><TaskTypesManager /></QueryClientProvider>)
}
beforeEach(() => { updateMutate.mockClear(); authState.role = 'admin' })

describe('TaskTypesManager', () => {
  it('lista tipos y sus subtareas de plantilla', () => {
    renderMgr()
    expect(screen.getByText('PPTO')).toBeTruthy()
    expect(screen.getByText('MUESTRAS')).toBeTruthy()
  })
  it('admin puede añadir una subtarea a la plantilla (llama updateTaskType)', () => {
    renderMgr()
    fireEvent.click(screen.getByText('PPTO')) // seleccionar
    fireEvent.click(screen.getByRole('button', { name: /añadir subtarea/i }))
    expect(updateMutate).toHaveBeenCalled()
    const arg = updateMutate.mock.calls[0][0]
    expect(arg.id).toBe('t1')
    expect(arg.patch.subtasks.length).toBe(3) // BOM, RFQ, + nueva
  })
  it('rol lectura no muestra controles de edición', () => {
    authState.role = 'lectura'
    renderMgr()
    expect(screen.getByText('PPTO')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /añadir subtarea/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /nuevo tipo/i })).toBeNull()
  })
})
