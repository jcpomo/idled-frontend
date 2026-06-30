import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <h1>Gestor IMASD</h1>
}

describe('test harness', () => {
  it('renders a component', () => {
    render(<Hello />)
    expect(screen.getByRole('heading', { name: 'Gestor IMASD' })).toBeInTheDocument()
  })
})
