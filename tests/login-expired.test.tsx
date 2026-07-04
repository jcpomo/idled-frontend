import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let original: Location
beforeEach(() => {
  original = window.location
  Object.defineProperty(window, 'location', {
    value: { href: '', search: '' }, writable: true, configurable: true,
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
})

it('shows the expired notice when ?expired=1 is present', async () => {
  ;(window.location as unknown as { search: string }).search = '?expired=1'
  const { default: Login } = await import('@/app/login/page')
  render(<Login />)
  expect(await screen.findByRole('alert')).toHaveTextContent('caducado')
})

it('shows no expired notice without the flag', async () => {
  ;(window.location as unknown as { search: string }).search = ''
  const { default: Login } = await import('@/app/login/page')
  render(<Login />)
  expect(screen.queryByRole('alert')).toBeNull()
})
