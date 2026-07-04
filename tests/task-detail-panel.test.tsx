import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const parent: Task = {
  id: 't1', title: 'Padre', task_type: 'PPTO', status: 'open',
  assignee: 'ED', due_date: null, position: 0, description: 'desc', parent_id: null,
}
const child: Task = {
  id: 's1', title: 'Hija', task_type: 'PPTO', status: 'open',
  assignee: null, due_date: null, position: 0, description: null, parent_id: 't1',
}

function stub(opts: { current?: Task; subtasks?: Task[]; byId?: Record<string, Task> } = {}) {
  const update = vi.fn(); const move = vi.fn(); const del = vi.fn(); const createSub = vi.fn()
  const byId = opts.byId
  vi.spyOn(queries, 'useTask').mockImplementation(((id: string) =>
    ({ data: byId ? byId[id] : (opts.current ?? parent) })) as never)
  vi.spyOn(queries, 'useSubtasks').mockReturnValue({ data: opts.subtasks ?? [] } as never)
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: [parent] } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: move } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: del } as never)
  vi.spyOn(queries, 'useCreateSubtask').mockReturnValue({ mutate: createSub } as never)
  vi.spyOn(queries, 'useComments').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useCreateComment').mockReturnValue({ mutate: vi.fn() } as never)
  return { update, move, del, createSub }
}

it('renders the current task fields from useTask(taskId)', async () => {
  stub({ current: parent })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Padre')
})

it('top-level status change uses move', async () => {
  const { move } = stub({ current: parent })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  expect(move).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', status: 'done' }))
})

it('subtask status change uses update (PATCH) with parentId', async () => {
  const { update, move } = stub({ current: child })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="s1" projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  expect(move).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledWith({ taskId: 's1', patch: { status: 'done' }, parentId: 't1' })
})

it('lists subtasks with progress and creates one', async () => {
  const done: Task = { ...child, id: 's2', title: 'Hecha', status: 'done' }
  const { createSub } = stub({ current: parent, subtasks: [child, done] })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('subtask-progress').textContent).toBe('1/2')
  expect(screen.getAllByTestId('subtask-item')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('nueva subtarea'), { target: { value: 'Nueva' } })
  fireEvent.click(screen.getByRole('button', { name: 'crear subtarea' }))
  expect(createSub).toHaveBeenCalledWith({ title: 'Nueva' })
})

it('clicking a subtask navigates into it, breadcrumb returns to parent', async () => {
  stub({ byId: { t1: parent, s1: child }, subtasks: [child] })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  // open the subtask
  fireEvent.click(screen.getByTestId('subtask-item'))
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Hija')
  // breadcrumb back to the parent
  fireEvent.click(screen.getByRole('button', { name: 'volver a Padre' }))
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Padre')
})
