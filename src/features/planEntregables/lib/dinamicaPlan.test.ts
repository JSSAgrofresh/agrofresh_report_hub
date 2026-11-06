import { describe, expect, it } from 'vitest'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan } from './api'
import { semanaDeFecha } from './avanceSemanal'
import { aplanarDinamica, clavesConHijos, construirDinamica, totalDe } from './dinamicaPlan'
import { propuestoYHechoPorSemana, topClientes } from './graficosPlan'

const sol = (lab: string, sold: string, ship: string, fecha: string) =>
  ({ archivo: Math.random().toString(), laboratorio: lab, sold_to: sold, ship_to: ship, fecha_muestreo: fecha, fecha_solicitud: null, emitida_en: null, concretada: false }) as unknown as SolicitudAuditoria

const sem = (planta: string, servicio: 'residuales' | 'fsma' | 'fito', semana: string, propuesta: number, comercial = 'LABARCA', tipo = 'Estrategico') =>
  ({ planta, servicio, semana, original: propuesta + 1, propuesta, comercial, tipo_cliente: tipo })

const plan = new Map<string, ClientePlan>([
  ['DOLE CHILE SA', {
    sold_to: 'DOLE CHILE S.A.', original: { residuales: 0, fsma: 0, fito: 0 }, propuesta: { residuales: 5, fsma: 0, fito: 1 }, plantas: [],
    semanas: [sem('DOLE LONTUE', 'residuales', 'W45', 2), sem('DOLE LONTUE', 'residuales', 'W46', 3), sem('DOLE CODEGUA', 'fito', 'W46', 1)],
  }],
  ['MACE', {
    sold_to: 'MACE SA', original: { residuales: 0, fsma: 0, fito: 0 }, propuesta: { residuales: 2, fsma: 0, fito: 0 }, plantas: [],
    semanas: [sem('MACE', 'residuales', 'W46', 2, 'TRAVERSO', 'Preferente')],
  }],
])

const lista = [
  sol('AGROFRESH', 'DOLE CHILE S.A.', 'DOLE LONTUE', '2026-11-04'), // W45
  sol('QUITECA', 'DOLE CHILE S.A.', 'Dole Lontué', '2026-11-10'), // W46
  sol('ALS', 'DOLE CHILE S.A.', 'OTRA PLANTA', '2026-11-11'), // W46, FSMA, planta fuera del plan
  sol('AGROFRESH', 'CLIENTE NUEVO', 'X', '2026-11-11'), // fuera del plan
  sol('AGROFRESH', 'DOLE CHILE S.A.', 'DOLE LONTUE', '2026-09-01'), // fuera de temporada
]

describe('construirDinamica', () => {
  const arbol = construirDinamica(lista, plan)
  const cliente = (n: string) => arbol.find((x) => x.nombre === n)!

  it('un renglón por cliente (Sold To), con su comercial y su tipo; cada cliente se abre en sus plantas', () => {
    expect(arbol.map((n) => n.nombre)).toEqual(['DOLE CHILE S.A.', 'MACE SA', 'CLIENTE NUEVO'])
    expect(cliente('DOLE CHILE S.A.')).toMatchObject({ nivel: 'cliente', comercial: 'LABARCA', tipo: 'Estratégico' })
    expect(cliente('MACE SA')).toMatchObject({ comercial: 'TRAVERSO', tipo: 'Preferente' })
    expect(cliente('DOLE CHILE S.A.').hijos.map((p) => p.nombre)).toEqual(['DOLE LONTUE', 'DOLE CODEGUA', '-'])
  })

  it('cada celda lleva lo propuesto y lo hecho de su semana', () => {
    const dole = cliente('DOLE CHILE S.A.')
    expect(dole.datos.residuales.W45).toMatchObject({ prop: 2, hecho: 1, agrofresh: 1, quiteca: 0 })
    expect(dole.datos.residuales.W46).toMatchObject({ prop: 3, hecho: 1, agrofresh: 0, quiteca: 1 })
    expect(dole.datos.fito.W46).toMatchObject({ prop: 1, hecho: 0 })
    // el cruce de plantas no distingue tildes ni mayúsculas
    const lontue = dole.hijos.find((p) => p.nombre === 'DOLE LONTUE')!
    expect(totalDe(lontue.datos, 'residuales')).toMatchObject({ prop: 5, hecho: 2 })
  })

  it('lo hecho en una planta que el plan no trae queda «sin cruzar», y lo de fuera de temporada no cuenta', () => {
    const dole = cliente('DOLE CHILE S.A.')
    const sinCruzar = dole.hijos.find((p) => p.sinCruzar)!
    expect(totalDe(sinCruzar.datos, 'fsma').hecho).toBe(1)
    expect(totalDe(dole.datos, 'residuales').hecho).toBe(2) // el de septiembre no entra
  })

  it('un cliente que el plan no trae va al final, marcado «fuera del plan», con su Ship To como planta', () => {
    const fuera = cliente('CLIENTE NUEVO')
    expect(fuera.fueraDelPlan).toBe(true)
    expect(fuera.hijos[0].nombre).toBe('X')
    expect(totalDe(fuera.datos, 'residuales').hecho).toBe(1)
  })

  it('aplanar solo baja a las plantas de lo abierto y salta lo que no tiene nada en los análisis visibles', () => {
    const todos = ['residuales', 'fsma', 'fito'] as const
    expect(aplanarDinamica(arbol, new Set(), [...todos]).map((f) => f.nodo.nombre)).toEqual(['DOLE CHILE S.A.', 'MACE SA', 'CLIENTE NUEVO'])
    const abierto = aplanarDinamica(arbol, new Set(clavesConHijos(arbol)), [...todos])
    expect(abierto.map((f) => f.nivel)).toContain(1)
    expect(abierto.length).toBeGreaterThan(6)
    expect(aplanarDinamica(arbol, new Set(), ['fsma']).map((f) => f.nodo.nombre)).toEqual(['DOLE CHILE S.A.'])
  })
})

describe('gráficos del plan', () => {
  it('propuesto y hecho por semana', () => {
    const s = propuestoYHechoPorSemana(lista, plan)
    const w46 = s.find((x) => x.semana === 'W46')!
    expect(w46).toMatchObject({ propuesto: 3 + 1 + 2, hecho: 3 })
    expect(s.find((x) => x.semana === 'W45')).toMatchObject({ propuesto: 2, hecho: 1 })
    expect(s).toHaveLength(14)
  })

  it('respeta los análisis visibles', () => {
    const s = propuestoYHechoPorSemana(lista, plan, ['fsma'])
    expect(s.find((x) => x.semana === 'W46')).toMatchObject({ propuesto: 0, hecho: 1 })
  })

  it('los clientes con más análisis, divididos por laboratorio, con lo propuesto', () => {
    const t = topClientes(lista, ['residuales', 'fsma', 'fito'], plan, 10)
    expect(t[0]).toMatchObject({ cliente: 'DOLE CHILE S.A.', agrofresh: 2, quiteca: 1, fsma: 1, fito: 0, total: 4, propuesto: 6 })
    expect(t[1]).toMatchObject({ cliente: 'CLIENTE NUEVO', total: 1, propuesto: null })
    expect(topClientes(lista, ['residuales', 'fsma', 'fito'], plan, 1)).toHaveLength(1)
  })
})

describe('semanaDeFecha', () => {
  it('pone la semana ISO de la temporada', () => {
    expect(semanaDeFecha('2026-10-05')).toBe('W41')
    expect(semanaDeFecha('2026-12-30')).toBe('W52')
    expect(semanaDeFecha('2027-01-12')).toBe('W02')
    expect(semanaDeFecha('2026-09-28')).toBeNull()
    expect(semanaDeFecha(null)).toBeNull()
  })
})
