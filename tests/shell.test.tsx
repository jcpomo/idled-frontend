import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
