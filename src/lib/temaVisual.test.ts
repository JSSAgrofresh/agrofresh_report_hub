import { beforeEach, describe, expect, it } from 'vitest'
import { aplicarTemaGuardado, guardarTema, leerTema } from './temaVisual'

describe('temaVisual', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.tema
  })

  it('parte en claro cuando no hay elección guardada', () => {
    expect(leerTema()).toBe('claro')
    aplicarTemaGuardado()
    expect(document.documentElement.dataset.tema).toBe('claro')
  })

  it('guarda el tema oscuro, lo aplica y lo recuerda', () => {
    guardarTema('oscuro')
    expect(document.documentElement.dataset.tema).toBe('oscuro')
    expect(leerTema()).toBe('oscuro')
    delete document.documentElement.dataset.tema
    aplicarTemaGuardado()
    expect(document.documentElement.dataset.tema).toBe('oscuro')
  })

  it('un valor guardado raro vuelve a claro', () => {
    window.localStorage.setItem('agrofresh.tema-visual.v1', 'violeta')
    expect(leerTema()).toBe('claro')
  })
})
