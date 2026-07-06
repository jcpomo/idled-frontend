import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as auth from '@/lib/auth'
import * as queries from '@/lib/queries'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

beforeEach(() => { pushMock.mockClear(); vi.restoreAllMocks() })

it('renders the sidebar nav when authenticated', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [] } as never)
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
  expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()
})

it('the logout button calls logout', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [] } as never)
  const logoutSpy = vi.spyOn(auth, 'logout').mockImplementation(() => {})
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  fireEvent.click(screen.getByLabelText('cerrar sesión'))
  expect(logoutSpy).toHaveBeenCalled()
})

it('shows an unread badge and a Notificaciones link', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [
    { id: 'n1', type: 'assigned', message: 'x', task_id: null, project_id: null, read: false, created_at: '' },
    { id: 'n2', type: 'shared', message: 'y', task_id: null, project_id: null, read: false, created_at: '' },
  ] } as never)
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  const link = screen.getByRole('link', { name: /Notificaciones/ })
  expect(link).toHaveAttribute('href', '/notifications')
  expect(screen.getByTestId('unread-badge')).toHaveTextContent('2')
})
