import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const task: Task = {
  id: 't1', title: 'Estudio', task_type: 'PPTO', status: 'open',
  assignee: 'ED', due_date: null, position: 0, description: 'desc inicial',
}
const others: Task[] = [
  task,
  { id: 't2', title: 'Otra', task_type: 'PPTO', status: 'done', assignee: null, due_date: null, position: 0, description: null },
]

function stub() {
  const update = vi.fn()
  const move = vi.fn()
  const del = vi.fn()
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: move } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: del } as never)
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: others, isLoading: false } as never)
  return { update, move, del }
}

it('renders the task fields including description', async () => {
  stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Estudio')
  expect((screen.getByLabelText('descripción') as HTMLTextAreaElement).value).toBe('desc inicial')
})

it('blurring the title with a change patches the title', async () => {
  const { update } = stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  const title = screen.getByLabelText('título')
  fireEvent.change(title, { target: { value: 'Nuevo' } })
  fireEvent.blur(title)
  expect(update).toHaveBeenCalledWith({ taskId: 't1', patch: { title: 'Nuevo' } })
})

it('changing status moves the task appended to the destination column', async () => {
  const { move } = stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  // one task already in 'done' among `others` -> position 1
  expect(move).toHaveBeenCalledWith({ taskId: 't1', status: 'done', position: 1 })
})

it('deleting requires a confirm click then deletes and closes', async () => {
  const { del } = stub()
  const onClose = vi.fn()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado' }))
  expect(del).toHaveBeenCalledWith('t1')
  expect(onClose).toHaveBeenCalled()
})
