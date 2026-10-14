import { describe, expect, it } from 'vitest'
import { avancePlan, cantidadPlan, indexarPlan, normalizarNombre } from './plan'

const plan = indexarPlan([
  { sold_to: 'DOLE CHILE S.A.', residuales: 88, fsma: 0, fito: 10, plantas: [] },
])

describe('plan de entregables', () => {
  it('busca el Sold To sin importar tildes, mayúsculas ni puntos', () => {
    expect(normalizarNombre('Dole  Chile S.A.')).toBe('DOLE CHILE SA')
    expect(plan.get(normalizarNombre('dole chile s.a.'))?.residuales).toBe(88)
  })
  it('lo que no está prometido no se juzga', () => {
    const c = plan.get('DOLE CHILE SA')
    expect(cantidadPlan(c, 'residuales')).toBe(88)
    expect(cantidadPlan(c, 'fsma')).toBeNull()
    expect(cantidadPlan(undefined, 'residuales')).toBeNull()
  })
  it('el avance es lo hecho sobre lo prometido', () => {
    expect(avancePlan(8, 88)).toBeCloseTo(0.0909, 3)
    expect(avancePlan(8, null)).toBeNull()
    expect(avancePlan(120, 100)).toBe(1.2)
  })
})
