import { describe, expect, it } from 'vitest'
import { DIAPOSITIVAS, ENGRANAJES, NODOS, PASOS_SIMULACION, anteriorDe, diapositivaDe, indiceDe, siguienteDe } from './diapositivas'

describe('diapositivas', () => {
  it('son ocho, en el orden de la presentación', () => {
    expect(DIAPOSITIVAS.map((d) => d.id)).toEqual(['portada', 'indice', 'viaje', 'sistemas', 'motor', 'historia', 'publicar', 'aporte'])
  })

  it('siguiente y anterior', () => {
    expect(siguienteDe('portada')?.id).toBe('indice')
    expect(anteriorDe('indice')?.id).toBe('portada')
    expect(anteriorDe('portada')).toBeUndefined()
    expect(siguienteDe('aporte')).toBeUndefined()
  })

  it('una diapositiva que no existe no tiene vecinas ni nombre', () => {
    expect(indiceDe('nada')).toBe(-1)
    expect(siguienteDe('nada')).toBeUndefined()
    expect(anteriorDe(undefined)).toBeUndefined()
    expect(diapositivaDe('nada')).toBeUndefined()
    expect(diapositivaDe('viaje')?.nombre).toBe('Report Hub')
  })

  it('los paneles que se activan desde el teléfono coinciden con los de la presentación', () => {
    expect(PASOS_SIMULACION).toHaveLength(7)
    expect(NODOS).toHaveLength(14)
    expect(ENGRANAJES.map((g) => g.k)).toEqual(['ingesta', 'homog', 'correo', 'toma', 'verif', 'report', 'panel', 'usuarios'])
  })
})
