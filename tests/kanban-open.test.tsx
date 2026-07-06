import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const tasks: Task[] = [
  { id: 't1', title: 'Estudio viabilidad', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 0, description: null, parent_id: null },
]

function stub() {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useTask').mockReturnValue({ data: tasks[0] } as never)
  vi.spyOn(queries, 'useSubtasks').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useCreateSubtask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useComments').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useCreateComment').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
}

it('clicking a card opens the task detail panel', async () => {
  stub()
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  expect(screen.queryByTestId('task-detail-panel')).toBeNull()
  fireEvent.click(screen.getByText('Estudio viabilidad'))
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
})
