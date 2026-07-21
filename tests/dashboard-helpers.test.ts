import { describe, it, expect } from 'vitest'
import { greeting, taskStats, filterMyTasks } from '@/lib/dashboard'
import type { MyTask } from '@/lib/types'

const mk = (id: string, due: string | null): MyTask => ({
  id, title: id, project_id: 'p', project_name: 'P', status: 'open',
  due_date: due, subtask_done: 0, subtask_total: 0,
})

describe('greeting', () => {
  it('cambia por hora', () => {
    expect(greeting(8)).toBe('Buenos días')
    expect(greeting(15)).toBe('Buenas tardes')
    expect(greeting(23)).toBe('Buenas noches')
  })
})

describe('taskStats', () => {
  it('cuenta hoy y atrasadas', () => {
    const today = '2026-07-21'
    const tasks = [mk('a', '2026-07-21'), mk('b', '2026-07-20'), mk('c', '2026-07-25'), mk('d', null)]
    expect(taskStats(tasks, today)).toEqual({ today: 1, overdue: 1 })
  })
})

describe('filterMyTasks', () => {
  const today = '2026-07-21'
  const tasks = [mk('a', '2026-07-21'), mk('b', '2026-07-20'), mk('c', '2026-07-25'), mk('d', '2026-08-30'), mk('e', null)]
  it('all devuelve todas', () => { expect(filterMyTasks(tasks, 'all', today)).toHaveLength(5) })
  it('today', () => { expect(filterMyTasks(tasks, 'today', today).map(t => t.id)).toEqual(['a']) })
  it('overdue', () => { expect(filterMyTasks(tasks, 'overdue', today).map(t => t.id)).toEqual(['b']) })
  it('week incluye hoy..+7', () => { expect(filterMyTasks(tasks, 'week', today).map(t => t.id).sort()).toEqual(['a', 'c']) })
})
