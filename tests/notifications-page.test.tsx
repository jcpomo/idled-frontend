import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Notification } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const items: Notification[] = [
  { id: 'n1', type: 'assigned', message: 'Te han asignado la tarea «A»', task_id: 't1', project_id: 'p1', read: false, created_at: '2026-07-06T10:00:00+00:00' },
  { id: 'n2', type: 'shared', message: 'Te han añadido al proyecto «P»', task_id: null, project_id: 'p1', read: true, created_at: '2026-07-06T09:00:00+00:00' },
]

function stub(list: Notification[]) {
  const markRead = vi.fn(); const markAll = vi.fn()
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: list } as never)
  vi.spyOn(queries, 'useMarkNotificationRead').mockReturnValue({ mutate: markRead } as never)
  vi.spyOn(queries, 'useMarkAllNotificationsRead').mockReturnValue({ mutate: markAll } as never)
  return { markRead, markAll }
}

it('lists notifications and marks one read on click', async () => {
  const { markRead } = stub(items)
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  expect(screen.getAllByTestId('notification-item')).toHaveLength(2)
  expect(screen.getByText('Te han asignado la tarea «A»')).toBeInTheDocument()
  fireEvent.click(screen.getAllByTestId('notification-item')[0])
  expect(markRead).toHaveBeenCalledWith('n1')
})

it('marks all read', async () => {
  const { markAll } = stub(items)
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  fireEvent.click(screen.getByLabelText('marcar todas'))
  expect(markAll).toHaveBeenCalled()
})

it('shows an empty state', async () => {
  stub([])
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  expect(screen.getByText('Sin notificaciones')).toBeInTheDocument()
})
