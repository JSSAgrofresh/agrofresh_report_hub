import { describe, expect, it } from 'vitest'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import { avanceSemanal, semanaDeFecha, sumarAvance } from './avanceSemanal'
import type { ClientePlan } from './api'

const sol = (lab: string, sold: string, ship: string, fecha: string) =>
  ({ archivo: `${lab}${sold}${ship}${fecha}${Math.random()}`, laboratorio: lab, sold_to: sold, ship_to: ship, fecha_muestreo: fecha, fecha_solicitud: null, emitida_en: null, concretada: false }) as unknown as SolicitudAuditoria

const plan = new Map<string, ClientePlan>([
  ['DOLE CHILE SA', {
    sold_to: 'DOLE CHILE S.A.', original: { residuales: 0, fsma: 0, fito: 0 }, propuesta: { residuales: 0, fsma: 0, fito: 0 }, plantas: [],
    semanas: [
      { planta: 'DOLE LONTUE', servicio: 'residuales', semana: 'W45', original: 1, propuesta: 2 },
      { planta: 'DOLE LONTUE', servicio: 'residuales', semana: 'W46', original: 1, propuesta: 2 },
      { planta: 'DOLE LONTUE', servicio: 'fito', semana: 'W46', original: 0, propuesta: 1 },
      { planta: 'DOLE CODEGUA', servicio: 'residuales', semana: 'W46', original: 1, propuesta: 1 },
    ],
  }],
])

describe('semanaDeFecha', () => {
  it('pone la semana ISO de la temporada', () => {
    expect(semanaDeFecha('2026-10-05')).toBe('W41')
    expect(semanaDeFecha('2026-11-10')).toBe('W46')
    expect(semanaDeFecha('2026-12-30')).toBe('W52') // la semana 53 de 2026 cuenta como W52
    expect(semanaDeFecha('2027-01-05')).toBe('W01')
    expect(semanaDeFecha('2027-01-12')).toBe('W02')
  })
  it('fuera de la temporada o sin fecha no tiene semana', () => {
    expect(semanaDeFecha('2026-09-28')).toBeNull()
    expect(semanaDeFecha('2027-02-01')).toBeNull()
    expect(semanaDeFecha(null)).toBeNull()
    expect(semanaDeFecha('basura')).toBeNull()
  })
})

describe('avanceSemanal', () => {
  const lista = [
    sol('AGROFRESH', 'DOLE CHILE S.A.', 'DOLE LONTUE', '2026-11-04'), // W45
    sol('QUITECA', 'DOLE CHILE S.A.', 'Dole Lontué', '2026-11-10'), // W46
    sol('DIAGNOFRUIT', 'DOLE CHILE S.A.', 'DOLE LONTUE', '2026-11-11'), // W46
    sol('AGROFRESH', 'DOLE CHILE S.A.', 'OTRA PLANTA', '2026-11-11'), // W46, no está en el plan
    sol('AGROFRESH', 'DOLE CHILE S.A.', 'DOLE LONTUE', '2026-09-01'), // fuera de temporada
  ]

  it('una semana: lo hecho esa semana contra lo que tocaba, por laboratorio y por planta', () => {
    const [dole] = avanceSemanal(lista, plan, { version: 'propuesta', hasta: 'W46', modo: 'semana' })
    expect(dole.celdas.residuales).toMatchObject({ hecho: 2, debia: 3, agrofresh: 1, quiteca: 1 })
    expect(dole.celdas.fito).toMatchObject({ hecho: 1, debia: 1 })
    const lontue = dole.plantas.find((p) => p.planta === 'DOLE LONTUE')!
    expect(lontue.celdas.residuales).toMatchObject({ hecho: 1, debia: 2, quiteca: 1 })
    // lo que no calza con ninguna planta del plan queda aparte, al final
    const sinCruzar = dole.plantas.at(-1)!
    expect(sinCruzar.planta).toBeNull()
    expect(sinCruzar.celdas.residuales.hecho).toBe(1)
  })

  it('acumulado: suma desde W41 hasta la semana elegida', () => {
    const [dole] = avanceSemanal(lista, plan, { version: 'propuesta', hasta: 'W46', modo: 'acumulado' })
    expect(dole.celdas.residuales).toMatchObject({ hecho: 3, debia: 5 })
    const [w45] = avanceSemanal(lista, plan, { version: 'propuesta', hasta: 'W45', modo: 'acumulado' })
    expect(w45.celdas.residuales).toMatchObject({ hecho: 1, debia: 2 })
  })

  it('usa la versión elegida del entregable', () => {
    const [dole] = avanceSemanal(lista, plan, { version: 'original', hasta: 'W46', modo: 'semana' })
    expect(dole.celdas.residuales.debia).toBe(2)
    expect(dole.celdas.fito.debia).toBe(0)
  })

  it('solo cuenta los análisis visibles', () => {
    const [dole] = avanceSemanal(lista, plan, { version: 'propuesta', hasta: 'W46', modo: 'semana', analisis: ['fito'] })
    expect(dole.celdas.residuales).toMatchObject({ hecho: 0, debia: 0 })
    expect(dole.celdas.fito).toMatchObject({ hecho: 1, debia: 1 })
  })

  it('un cliente fuera del plan con análisis hechos aparece sin lo que debía', () => {
    const filas = avanceSemanal([...lista, sol('ALS', 'OTRO CLIENTE', 'X', '2026-11-10')], plan, { version: 'propuesta', hasta: 'W46', modo: 'semana' })
    const otro = filas.find((f) => f.cliente === 'OTRO CLIENTE')!
    expect(otro.conPlan).toBe(false)
    expect(otro.celdas.fsma).toMatchObject({ hecho: 1, debia: 0 })
  })

  it('la fila Total suma a todos los clientes', () => {
    const filas = avanceSemanal([...lista, sol('ALS', 'OTRO CLIENTE', 'X', '2026-11-10')], plan, { version: 'propuesta', hasta: 'W46', modo: 'semana' })
    const t = sumarAvance(filas)
    expect(t.fsma.hecho).toBe(1)
    expect(t.residuales).toMatchObject({ hecho: 2, debia: 3 })
  })
})
