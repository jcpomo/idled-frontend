import { describe, it, expect } from 'vitest'
import { canManageTypes } from '@/lib/roles'
describe('canManageTypes', () => {
  it('admin y direccion pueden', () => {
    expect(canManageTypes('admin')).toBe(true)
    expect(canManageTypes('direccion')).toBe(true)
  })
  it('otros no', () => {
    expect(canManageTypes('lectura')).toBe(false)
    expect(canManageTypes(null)).toBe(false)
  })
})
