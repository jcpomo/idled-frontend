import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as auth from '@/lib/auth'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

beforeEach(() => { pushMock.mockClear(); vi.restoreAllMocks() })

it('renders the sidebar nav when authenticated', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
})

it('the logout button calls logout', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const logoutSpy = vi.spyOn(auth, 'logout').mockImplementation(() => {})
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  fireEvent.click(screen.getByLabelText('cerrar sesión'))
  expect(logoutSpy).toHaveBeenCalled()
})
