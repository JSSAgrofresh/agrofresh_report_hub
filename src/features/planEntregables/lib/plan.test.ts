import { describe, expect, it } from 'vitest'
import { avancePlan, cantidadPlan, indexarPlan, normalizarNombre } from './plan'

const plan = indexarPlan([
  {
    sold_to: 'DOLE CHILE S.A.',
    original: { residuales: 70, fsma: 5, fito: 0 },
    propuesta: { residuales: 88, fsma: 0, fito: 10 },
    plantas: [],
  },
])

describe('plan de entregables', () => {
  it('busca el Sold To sin importar tildes, mayúsculas ni puntos', () => {
    expect(normalizarNombre('Dole  Chile S.A.')).toBe('DOLE CHILE SA')
    expect(plan.get(normalizarNombre('dole chile s.a.'))?.propuesta.residuales).toBe(88)
  })
  it('lo que no está prometido no se juzga', () => {
    const c = plan.get('DOLE CHILE SA')
    expect(cantidadPlan(c, 'residuales')).toBe(88)
    expect(cantidadPlan(c, 'fsma')).toBeNull()
    expect(cantidadPlan(undefined, 'residuales')).toBeNull()
  })
  it('trae las dos versiones del entregable: la propuesta por defecto y la original aparte', () => {
    const c = plan.get('DOLE CHILE SA')
    expect(cantidadPlan(c, 'residuales', 'original')).toBe(70)
    expect(cantidadPlan(c, 'fsma', 'original')).toBe(5)
    expect(cantidadPlan(c, 'fsma', 'propuesta')).toBeNull() // no la promete la propuesta
    expect(cantidadPlan(c, 'fito', 'original')).toBeNull()
  })
  it('el avance es lo hecho sobre lo prometido', () => {
    expect(avancePlan(8, 88)).toBeCloseTo(0.0909, 3)
    expect(avancePlan(8, null)).toBeNull()
    expect(avancePlan(120, 100)).toBe(1.2)
  })
})
