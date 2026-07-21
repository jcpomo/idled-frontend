import type { MyTask } from '@/lib/types'
import { addDays } from '@/lib/dates'

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function taskStats(tasks: MyTask[], today: string): { today: number; overdue: number } {
  let t = 0, o = 0
  for (const task of tasks) {
    if (!task.due_date) continue
    if (task.due_date === today) t++
    else if (task.due_date < today) o++
  }
  return { today: t, overdue: o }
}

export type MyTasksFilter = 'all' | 'today' | 'overdue' | 'week'

export function filterMyTasks(tasks: MyTask[], filter: MyTasksFilter, today: string): MyTask[] {
  if (filter === 'all') return tasks
  if (filter === 'today') return tasks.filter((t) => t.due_date === today)
  if (filter === 'overdue') return tasks.filter((t) => t.due_date != null && t.due_date < today)
  // week: due en [today, today+7] inclusive
  const end = addDays(today, 7)
  return tasks.filter((t) => t.due_date != null && t.due_date >= today && t.due_date <= end)
}
