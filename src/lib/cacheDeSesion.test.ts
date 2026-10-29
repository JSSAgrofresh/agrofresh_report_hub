import { beforeEach, describe, expect, it, vi } from 'vitest'

const sesion = { token: 'a' as string | null }
vi.mock('@/services/http/sesion', () => ({ tokenActual: () => sesion.token }))

import { crearCacheDeSesion } from './cacheDeSesion'

beforeEach(() => {
  sesion.token = 'a'
})

describe('crearCacheDeSesion', () => {
  it('devuelve lo guardado con la misma sesión y nada con otra (ni al volver a entrar)', () => {
    const c = crearCacheDeSesion<number>()
    c.guardar('x', 1)
    expect(c.leer('x')).toBe(1)
    sesion.token = 'b'
    expect(c.leer('x')).toBeUndefined()
    sesion.token = null
    expect(c.leer('x')).toBeUndefined()
    sesion.token = 'a'
    expect(c.leer('x')).toBe(1)
  })

  it('guarda solo las últimas usadas', () => {
    const c = crearCacheDeSesion<number>(2)
    c.guardar('1', 1)
    c.guardar('2', 2)
    c.leer('1') // 1 pasa a ser la más reciente
    c.guardar('3', 3)
    expect(c.leer('2')).toBeUndefined()
    expect(c.leer('1')).toBe(1)
    expect(c.leer('3')).toBe(3)
  })
})
