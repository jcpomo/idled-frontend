import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const tasks: Task[] = [
  { id: 't1', title: 'Estudio viabilidad', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 0 },
  { id: 't2', title: 'Render frontal', task_type: 'NUEVO DISEÑO', status: 'progress', assignee: 'CR', due_date: null, position: 0 },
  { id: 't3', title: 'Alta artículo ERP', task_type: 'PPTO', status: 'done', assignee: 'BR', due_date: null, position: 0 },
]

it('renders tasks grouped into status columns', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as any)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as any)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as any)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as any)
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  const open = screen.getByTestId('column-open')
  expect(within(open).getByText('Estudio viabilidad')).toBeInTheDocument()
  const done = screen.getByTestId('column-done')
  expect(within(done).getByText('Alta artículo ERP')).toBeInTheDocument()
  // task in 'progress' must not appear in the 'open' column
  expect(within(open).queryByText('Render frontal')).toBeNull()
})

it('shows the assignee member name on the card, falling back to the raw id', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: [
    { id: 't1', title: 'Con miembro', task_type: 'PPTO', status: 'open', assignee: 'ext-2', due_date: null, position: 0, description: null, parent_id: null },
    { id: 't2', title: 'Legacy', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 1, description: null, parent_id: null },
  ], isLoading: false } as never)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [
    { external_id: 'ext-2', name: 'Bea', is_owner: false },
  ] } as never)
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  expect(screen.getByText('· Bea')).toBeInTheDocument()   // resolved name
  expect(screen.getByText('· ED')).toBeInTheDocument()    // legacy fallback to raw id
})
