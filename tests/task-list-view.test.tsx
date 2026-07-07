import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

vi.mock('@/components/kanban/TaskDetailPanel', () => ({
  default: ({ taskId }: { taskId: string }) => <div data-testid="detail-panel">{taskId}</div>,
}))

beforeEach(() => vi.restoreAllMocks())

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: `T-${id}`, task_type: 'PPTO', status: 'open', assignee: null,
  due_date: null, position: 0, description: null, parent_id: null, ...over,
})

function stub(tasks: Task[], members: { external_id: string; name: string | null }[] = []) {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: members } as never)
}

it('groups tasks by status with counts', async () => {
  stub([task('1', { status: 'open' }), task('2', { status: 'done' }), task('3', { status: 'open' })])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  const headers = screen.getAllByTestId('group-header').map((h) => h.textContent)
  expect(headers).toEqual(['OPEN · 2', 'IN PROGRESS · 0', 'REVIEW · 0', 'DONE · 1'])
  expect(screen.getAllByTestId('task-row')).toHaveLength(3)
})

it('resolves the assignee name, falling back to Sin asignar', async () => {
  stub([task('1', { assignee: 'ext-9' }), task('2', { assignee: null })],
       [{ external_id: 'ext-9', name: 'Marta' }])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.getByText('Marta')).toBeInTheDocument()
  expect(screen.getByText('Sin asignar')).toBeInTheDocument()
})

it('opens the detail panel with the clicked task id', async () => {
  stub([task('42', { status: 'review' })])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('task-row'))
  expect(screen.getByTestId('detail-panel')).toHaveTextContent('42')
})

it('shows Cargando while loading', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: undefined, isLoading: true } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})
