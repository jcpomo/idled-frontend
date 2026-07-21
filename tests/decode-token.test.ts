import { describe, it, expect } from 'vitest'
import { decodeToken } from '@/lib/auth'

// header.payload.signature — payload base64url de {sub,name,role}
function makeToken(payload: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('decodeToken', () => {
  it('extrae sub, name y role', () => {
    const t = makeToken({ sub: 'ana@idled.test', name: 'Ana Admin', role: 'administracion' })
    expect(decodeToken(t)).toEqual({ sub: 'ana@idled.test', name: 'Ana Admin', role: 'administracion' })
  })
  it('devuelve null con token nulo o corrupto', () => {
    expect(decodeToken(null)).toBeNull()
    expect(decodeToken('no-es-un-jwt')).toBeNull()
  })
})
