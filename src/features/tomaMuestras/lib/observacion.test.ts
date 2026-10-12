import { describe, expect, it } from 'vitest'
import { esEnsayo, topeObservacion } from './observacion'

describe('largo de la observación', () => {
  it('un ensayo (Sold To AGROFRESH y Ship To ENSAYO) admite 500', () => {
    expect(topeObservacion('AGROFRESH', 'ENSAYO')).toBe(500)
    expect(topeObservacion(' agrofresh ', 'Ensayos')).toBe(500)
    expect(esEnsayo('AGROFRESH', 'ENSAYO')).toBe(true)
  })

  it('todo lo demás sigue en 50, sea cual sea el tipo de servicio', () => {
    expect(topeObservacion('AGROFRESH', 'LABORATORIO DE POSTCOSECHA')).toBe(50)
    expect(topeObservacion('DOLE CHILE S.A.', 'ENSAYO')).toBe(50)
    expect(topeObservacion('', '')).toBe(50)
    expect(topeObservacion('AGROFRESH', '')).toBe(50)
  })
})
