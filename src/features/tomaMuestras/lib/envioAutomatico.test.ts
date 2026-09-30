import { describe, expect, it } from 'vitest'
import { enviaSoloSegunTipo } from './envioAutomatico'

describe('enviaSoloSegunTipo', () => {
  const cfg = { activo: true, por_tipo: { Actimist: false, 'Línea de proceso': true } }

  it('usa la regla propia del tipo', () => {
    expect(enviaSoloSegunTipo(cfg, 'Actimist')).toBe(false)
    expect(enviaSoloSegunTipo({ activo: false, por_tipo: { Actimist: true } }, 'Actimist')).toBe(true)
  })

  it('sin regla propia o sin tipo, rige la general', () => {
    expect(enviaSoloSegunTipo(cfg, 'R&D')).toBe(true)
    expect(enviaSoloSegunTipo(cfg, '')).toBe(true)
    expect(enviaSoloSegunTipo({ activo: false }, 'Actimist')).toBe(false)
  })
})
