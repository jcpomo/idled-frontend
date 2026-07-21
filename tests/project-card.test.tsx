import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ProjectCard from '@/components/dashboard/ProjectCard'

describe('ProjectCard', () => {
  it('muestra progreso done/total como porcentaje', () => {
    render(<ProjectCard project={{ id: 'p1', name: 'Serie X', color: '#FF7F24', task_count: 4, done_count: 1 }} />)
    expect(screen.getByText('Serie X')).toBeTruthy()
    expect(screen.getByText('4 tareas')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/project/p1')
  })
  it('0 tareas → 0%', () => {
    render(<ProjectCard project={{ id: 'p2', name: 'Vacío', color: '#FAC51C', task_count: 0, done_count: 0 }} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })
})
