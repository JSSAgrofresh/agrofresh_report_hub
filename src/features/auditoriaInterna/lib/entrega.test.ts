import { describe, expect, it } from 'vitest'
import {
  cajasPorLaboratorio,
  cuelloDeBotella,
  desgloseTramos,
  evaluar,
  evaluarTodas,
  percentil,
  resumenCumplimiento,
  resumenLeadTime,
  sensibilidad,
  seriePorMes,
  veredictoDe,
} from './entrega'
import type { Hitos } from './entrega'
import type { SolicitudAuditoria } from './tipos'

const AHORA = Date.parse('2026-10-01T12:00:00Z')
const d = (dia: number, hora = 12) => `2026-09-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:00:00Z`

function sol(p: Partial<SolicitudAuditoria> & { archivo: string }): SolicitudAuditoria {
  return {
    numero_solicitud: p.archivo, laboratorio: 'QUITECA', sold_to: 'A', ship_to: 'B', especie: null, variedad: null,
    tipo_servicio: null, analitos: [], fecha_solicitud: null, fecha_muestreo: null, emitida_en: d(1),
    informe: null, en_report: false, concretada: false, ...p,
  }
}
function hit(p: Partial<Hitos> & { archivo: string }): Hitos {
  return { emitida: d(1), enviada: null, informe: null, informe_fuente: null, report: null, en_report: false, cliente: null, ...p }
}

describe('percentil', () => {
  it('interpola y devuelve null sin datos', () => {
    expect(percentil([], 0.5)).toBeNull()
    expect(percentil([3, 4, 4, 5, 6, 6, 7, 8, 9, 20], 0.5)).toBe(6)
    expect(percentil([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentil([5], 0.9)).toBe(5)
  })
})

describe('veredictoDe', () => {
  it('entregada: cumple o es tarde; abierta: vence o aún corre; sin plazo, no se juzga', () => {
    expect(veredictoDe(true, 10, 20, 12)).toBe('cumplio')
    expect(veredictoDe(true, 12, 20, 12)).toBe('cumplio') // justo el último día
    expect(veredictoDe(true, 13, 20, 12)).toBe('tarde')
    expect(veredictoDe(false, null, 13, 12)).toBe('vencida')
    expect(veredictoDe(false, null, 12, 12)).toBe('plazo')
    expect(veredictoDe(true, 5, 5, null)).toBe('sin_plazo')
  })
})

describe('evaluar', () => {
  it('«concretado»: lead time hasta el último de informe y Report', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', enviada: d(2), informe: d(8), informe_fuente: 'carga', report: d(10), en_report: true })
    const e = evaluar(s, h, 'concretado', { QUITECA: 12 }, AHORA)
    expect(e.dias).toBe(9)
    expect(e.veredicto).toBe('cumplio')
    expect(e.tramos).toEqual({ envio: 1, laboratorio: 6, report: 2 })
  })
  it('«cliente»: sin envío al cliente sigue abierta aunque esté concretada', () => {
    const s = sol({ archivo: 'a', concretada: true })
    const h = hit({ archivo: 'a', informe: d(5), report: d(6) })
    const e = evaluar(s, h, 'cliente', { QUITECA: 12 }, AHORA)
    expect(e.entregada).toBe(false)
    expect(e.dias).toBeNull()
    expect(e.veredicto).toBe('vencida') // pasaron 30 días y el plazo es 12
  })
  it('«cliente»: con envío mide hasta el cliente y suma el tramo Report → cliente', () => {
    const s = sol({ archivo: 'a', concretada: true })
    const h = hit({ archivo: 'a', informe: d(5), report: d(6), cliente: d(9) })
    const e = evaluar(s, h, 'cliente', { QUITECA: 12 }, AHORA)
    expect(e.dias).toBe(8)
    expect(e.tramos.cliente).toBe(3)
  })
  it('un hito anterior a la emisión excluye la solicitud', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(5), report: '2026-08-01T00:00:00Z', en_report: true })
    expect(evaluar(s, h, 'concretado', { QUITECA: 12 }, AHORA).veredicto).toBe('excluida')
  })
  it('Report cargado antes que el PDF no da un tramo negativo', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(9), report: d(5), en_report: true })
    const e = evaluar(s, h, 'concretado', {}, AHORA)
    expect(e.tramos.report).toBe(0)
    expect(e.dias).toBe(8) // hasta el PDF, que fue lo último
  })
  it('concretada sin fecha de carga: usa la del informe y lo avisa', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const e = evaluar(s, hit({ archivo: 'a', informe: d(6), en_report: true }), 'concretado', {}, AHORA)
    expect(e.dias).toBe(5)
    expect(e.sinFechaReport).toBe(true)
  })
  it('sin plazo del laboratorio no se juzga', () => {
    const e = evaluar(sol({ archivo: 'a' }), null, 'concretado', {}, AHORA)
    expect(e.veredicto).toBe('sin_plazo')
  })
})

describe('resúmenes', () => {
  const lista = [
    sol({ archivo: '1', concretada: true }), // entregada en 5 d
    sol({ archivo: '2', concretada: true }), // entregada en 15 d (tarde)
    sol({ archivo: '3' }), // abierta y vencida (30 d)
    sol({ archivo: '4', emitida_en: d(29) }), // abierta, aún en plazo (2 d)
  ]
  const hitos = new Map<string, Hitos>([
    ['1', hit({ archivo: '1', informe: d(6) })],
    ['2', hit({ archivo: '2', informe: d(16) })],
  ])
  const ev = evaluarTodas(lista, hitos, 'concretado', { QUITECA: 12 }, AHORA)

  it('lead time: solo lo entregado entra; las abiertas se informan aparte', () => {
    const r = resumenLeadTime(ev)
    expect(r).toMatchObject({ total: 4, entregadas: 2, abiertas: 2, excluidas: 0, p50: 10 })
    expect(r.edadMedianaAbiertas).toBeCloseTo(16, 0)
  })
  it('cumplimiento: no cuentan las que aún están en plazo', () => {
    const r = resumenCumplimiento(ev)
    expect(r).toMatchObject({ cumplio: 1, tarde: 1, vencida: 1, plazo: 1, vencidas: 3 })
    expect(r.pct).toBeCloseTo(33.3, 1)
  })
  it('sensibilidad: más plazo, más cumplimiento (y nunca baja)', () => {
    const s = sensibilidad(ev, [-2, 0, 5])
    expect(s.map((x) => x.delta)).toEqual([-2, 0, 5])
    expect(s[0].pct).toBeLessThanOrEqual(s[1].pct as number)
    expect(s[2].pct).toBeGreaterThanOrEqual(s[1].pct as number)
  })
  it('cajas por laboratorio y desglose', () => {
    const c = cajasPorLaboratorio(ev, { QUITECA: 12 })
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ lab: 'QUITECA', n: 2, p50: 10, plazo: 12 })
    const tr = desgloseTramos(ev, 'concretado', 0.5)
    expect(tr.map((t) => t.clave)).toEqual(['envio', 'laboratorio', 'report'])
    expect(cuelloDeBotella(tr)).toBeNull() // sin hito de envío al laboratorio no hay tramos medibles
  })
  it('serie por mes de emisión; con pocos casos no inventa un punto', () => {
    const s = seriePorMes(ev)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ mes: '2026-09', n: 4, p50: null })
    expect(s[0].pct).toBeCloseTo(33.3, 1)
  })
})
