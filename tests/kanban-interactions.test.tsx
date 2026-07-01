import { describe, it, expect } from 'vitest'
import { resolveMove } from '@/components/kanban/Board'
import type { Task } from '@/lib/types'

const tasks: Task[] = [
  { id: 'a', title: 'a', task_type: 'PPTO', status: 'open', assignee: null, due_date: null, position: 0 },
  { id: 'b', title: 'b', task_type: 'PPTO', status: 'done', assignee: null, due_date: null, position: 0 },
]

it('resolveMove computes target status and append position', () => {
  // drop task 'a' over the 'done' column -> status done, position = count in done (1)
  expect(resolveMove('a', 'done', tasks)).toEqual({ taskId: 'a', status: 'done', position: 1 })
})

it('resolveMove returns null when dropped outside a column', () => {
  expect(resolveMove('a', null, tasks)).toBeNull()
})

it('resolveMove returns null for an unknown column', () => {
  expect(resolveMove('a', 'nope', tasks)).toBeNull()
})
