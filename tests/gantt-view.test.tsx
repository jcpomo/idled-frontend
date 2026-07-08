import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import { PX_PER_DAY } from '@/lib/gantt'
import type { Task } from '@/lib/types'

vi.mock('@/components/kanban/TaskDetailPanel', () => ({
  default: ({ taskId }: { taskId: string }) => <div data-testid="detail-panel">{taskId}</div>,
}))

// jsdom's PointerEvent doesn't carry clientX/clientY; back it with MouseEvent
// (which jsdom does populate) so drag coordinates flow through fireEvent.pointer*.
class FakePointerEvent extends MouseEvent {}
;(globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = FakePointerEvent

beforeEach(() => vi.restoreAllMocks())

const task = (over: Partial<Task>): Task => ({
  id: 'x', title: 't', task_type: 'PPTO', status: 'open', assignee: null,
  due_date: null, start_date: null, position: 0, description: null, parent_id: null, ...over,
})

const mutate = vi.fn()

function stub(tasks: Task[]) {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate } as never)
}

it('renders a bar per dated task and the day axis', async () => {
  stub([
    task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' }),
    task({ id: 'b', title: 'B', due_date: '2026-07-06' }), // single-day fallback
  ])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  expect(screen.getByTestId('gantt-axis')).toBeInTheDocument()
  expect(screen.getAllByTestId('gantt-bar')).toHaveLength(2)
})

it('lists tasks with no dates under "sin programar"', async () => {
  stub([task({ id: 'c', title: 'C' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  expect(screen.getByTestId('gantt-unscheduled')).toBeInTheDocument()
  expect(screen.getByTestId('gantt-unscheduled-row')).toHaveTextContent('C')
  expect(screen.queryByTestId('gantt-bar')).not.toBeInTheDocument()
})

it('opens the detail panel when a bar is clicked (no drag)', async () => {
  stub([task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  const bar = screen.getByTestId('gantt-bar')
  fireEvent.pointerDown(bar, { clientX: 100 })
  fireEvent.pointerUp(window, { clientX: 100 })
  expect(screen.getByTestId('detail-panel')).toHaveTextContent('a')
  expect(mutate).not.toHaveBeenCalled()
})

it('PATCHes new dates after dragging a bar', async () => {
  stub([task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  const bar = screen.getByTestId('gantt-bar')
  fireEvent.pointerDown(bar, { clientX: 100 })
  fireEvent.pointerMove(window, { clientX: 100 + 2 * PX_PER_DAY }) // +2 days
  fireEvent.pointerUp(window, { clientX: 100 + 2 * PX_PER_DAY })
  expect(mutate).toHaveBeenCalledWith({ taskId: 'a', patch: { start_date: '2026-07-07', due_date: '2026-07-10' } })
})
