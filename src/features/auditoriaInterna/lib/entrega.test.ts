import { describe, expect, it } from 'vitest'
import {
  atrasoDe,
  peoresAtrasos,
  resumenAtraso,
  alcanzados,
  cumplimientoPorAnalisis,
  diasHabiles,
  evaluar,
  evaluarTodas,
  nodoActual,
  percentil,
  plazoDe,
  resumenCumplimiento,
  resumenFlujo,
  resumenLeadTime,
  sensibilidad,
  seriePorMes,
  veredictoDe,
} from './entrega'
import type { EvaluadaEntrega, Hitos } from './entrega'
import type { SolicitudAuditoria } from './tipos'

// Septiembre 2026: el 1 es martes; 5-6, 12-13, 19-20 y 26-27 son fin de semana. Octubre: el 1 es jueves.
// Las fechas se arman en hora LOCAL para que las pruebas den lo mismo en cualquier zona horaria.
const AHORA = new Date(2026, 9, 1, 12).getTime()
const L = (mes: number, dia: number, hora = 12) => new Date(2026, mes - 1, dia, hora).toISOString()
const d = (dia: number, hora = 12) => L(9, dia, hora)

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

describe('diasHabiles', () => {
  it('cuenta lunes a viernes y no suma el fin de semana', () => {
    const t = (dia: number, h = 12) => new Date(2026, 8, dia, h).getTime()
    expect(diasHabiles(t(8), t(9))).toBeCloseTo(1, 6) // martes a miércoles
    expect(diasHabiles(t(4), t(7))).toBeCloseTo(1, 6) // viernes 12:00 a lunes 12:00: medio día + medio día
    expect(diasHabiles(t(5), t(6))).toBe(0) // sábado a domingo
    expect(diasHabiles(t(7, 12), t(7, 18))).toBeCloseTo(0.25, 6)
    expect(diasHabiles(t(2), t(9))).toBeCloseTo(5, 6) // una semana corrida = 5 días hábiles
  })
  it('un intervalo al revés o vacío es 0', () => {
    expect(diasHabiles(10, 10)).toBe(0)
    expect(diasHabiles(20, 10)).toBe(0)
  })
})

describe('plazoDe por análisis', () => {
  const plazos = { ALS: 3, 'ALS|FSMA': 6, 'DIAGNOFRUIT|CUANTIFICACIÓN DE PATÓGENOS (QPCR)': 9 }

  it('usa el plazo del Análisis pedido y no el de sus analitos', () => {
    const s = sol({ archivo: 'a', laboratorio: 'ALS', analisis: ['FSMA (E. Coli)'], analitos: ['COLIF100'] })
    expect(plazoDe(s, plazos)).toEqual({ dias: 3, analisis: null })
    expect(plazoDe({ ...s, analisis: ['fsma'] }, plazos)).toEqual({ dias: 6, analisis: 'FSMA' })
  })

  it('manda el Análisis más lento y, sin plazo propio, rige el general del laboratorio', () => {
    const s = sol({ archivo: 'b', laboratorio: 'Diagnofruit', analisis: ['Cuantificación de Patógenos (qPCR)'] })
    expect(plazoDe(s, plazos)).toEqual({ dias: 9, analisis: 'CUANTIFICACIÓN DE PATÓGENOS (QPCR)' })
  })
})

describe('plazoDe', () => {
  const plazos = { QUITECA: 5, 'QUITECA|FDL': 8, 'QUITECA|TBZ': 3 }
  it('manda el análisis más lento de la solicitud', () => {
    expect(plazoDe(sol({ archivo: 'a', analitos: ['FDL', 'PYR'] }), plazos)).toEqual({ dias: 8, analisis: 'FDL' })
  })
  it('un análisis sin plazo propio usa el general del laboratorio', () => {
    expect(plazoDe(sol({ archivo: 'a', analitos: ['PYR'] }), plazos)).toEqual({ dias: 5, analisis: null })
  })
  it('un análisis más rápido que el general no baja el plazo de un análisis sin plazo propio', () => {
    expect(plazoDe(sol({ archivo: 'a', analitos: ['TBZ', 'PYR'] }), plazos)).toEqual({ dias: 5, analisis: null })
  })
  it('sin análisis, el general; sin nada cargado, null', () => {
    expect(plazoDe(sol({ archivo: 'a' }), plazos)).toEqual({ dias: 5, analisis: null })
    expect(plazoDe(sol({ archivo: 'a', laboratorio: 'ALS' }), plazos)).toEqual({ dias: null, analisis: null })
  })
  it('un plazo por análisis sin plazo general también rige', () => {
    expect(plazoDe(sol({ archivo: 'a', laboratorio: 'ALS', analitos: ['HONGOS'] }), { 'ALS|HONGOS': 4 })).toEqual({ dias: 4, analisis: 'HONGOS' })
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
  it('el tiempo corre desde la recepción estimada (emisión + 1 día), en días hábiles', () => {
    // emitida mar 1 → recepción estimada mié 2; informe mié 9: cinco días hábiles
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(9), informe_fuente: 'carga', report: d(9), en_report: true })
    const e = evaluar(s, h, 'concretado', { QUITECA: 5 }, AHORA)
    expect(e.recepcion).toBe(new Date(2026, 8, 2, 12).getTime())
    expect(e.dias).toBeCloseTo(5, 6)
    expect(e.veredicto).toBe('cumplio')
  })
  it('«concretado»: lead time hasta el último de informe y Report', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(8), informe_fuente: 'carga', report: d(10), en_report: true })
    const e = evaluar(s, h, 'concretado', { QUITECA: 5 }, AHORA)
    expect(e.dias).toBeCloseTo(6, 6) // mié 2 → jue 10
    expect(e.veredicto).toBe('tarde')
  })
  it('entregado el mismo día de la recepción estimada o antes: 0, nunca negativo', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(1, 18), report: d(1, 18), en_report: true })
    expect(evaluar(s, h, 'concretado', { QUITECA: 5 }, AHORA).dias).toBe(0)
  })
  it('«cliente»: sin envío al cliente sigue abierta aunque esté concretada', () => {
    const s = sol({ archivo: 'a', concretada: true })
    const h = hit({ archivo: 'a', informe: d(5), report: d(6) })
    const e = evaluar(s, h, 'cliente', { QUITECA: 12 }, AHORA)
    expect(e.entregada).toBe(false)
    expect(e.dias).toBeNull()
    expect(e.veredicto).toBe('vencida') // pasaron 21 días hábiles y el plazo es 12
  })
  it('«cliente»: con envío mide hasta el cliente', () => {
    const s = sol({ archivo: 'a', concretada: true })
    const h = hit({ archivo: 'a', informe: d(5), report: d(6), cliente: d(9) })
    expect(evaluar(s, h, 'cliente', { QUITECA: 12 }, AHORA).dias).toBeCloseTo(5, 6)
  })
  it('un hito anterior a la emisión excluye la solicitud', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(5), report: L(8, 1, 0), en_report: true })
    expect(evaluar(s, h, 'concretado', { QUITECA: 12 }, AHORA).veredicto).toBe('excluida')
  })
  it('Report cargado antes que el PDF: el tiempo llega hasta el PDF, que fue lo último', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const h = hit({ archivo: 'a', informe: d(9), report: d(4), en_report: true })
    expect(evaluar(s, h, 'concretado', {}, AHORA).dias).toBeCloseTo(5, 6)
  })
  it('concretada sin fecha de carga: usa la del informe y lo avisa', () => {
    const s = sol({ archivo: 'a', concretada: true, en_report: true })
    const e = evaluar(s, hit({ archivo: 'a', informe: d(9), en_report: true }), 'concretado', {}, AHORA)
    expect(e.dias).toBeCloseTo(5, 6)
    expect(e.sinFechaReport).toBe(true)
  })
  it('sin plazo del laboratorio no se juzga', () => {
    expect(evaluar(sol({ archivo: 'a' }), null, 'concretado', {}, AHORA).veredicto).toBe('sin_plazo')
  })
  it('usa el plazo del análisis y dice cuál fue', () => {
    const s = sol({ archivo: 'a', analitos: ['FDL'], concretada: true })
    const e = evaluar(s, hit({ archivo: 'a', informe: d(9) }), 'concretado', { QUITECA: 3, 'QUITECA|FDL': 8 }, AHORA)
    expect(e).toMatchObject({ plazo: 8, analisis: 'FDL', veredicto: 'cumplio' })
  })
})

describe('resúmenes', () => {
  const lista = [
    sol({ archivo: '1', concretada: true, en_report: true, analitos: ['FDL'] }), // entregada en 4 d hábiles
    sol({ archivo: '2', concretada: true }), // entregada en 9 d (tarde)
    sol({ archivo: '3' }), // abierta y vencida (21 d hábiles)
    sol({ archivo: '4', emitida_en: d(29) }), // abierta, aún en plazo (1 d)
  ]
  const hitos = new Map<string, Hitos>([
    ['1', hit({ archivo: '1', informe: d(8), report: d(8), cliente: d(9), observado: d(10), observado_por: ['DOLE · LONTUE'] })],
    ['2', hit({ archivo: '2', informe: d(15) })],
  ])
  const ev = evaluarTodas(lista, hitos, 'concretado', { QUITECA: 5 }, AHORA)

  it('lead time: solo lo entregado entra; las abiertas se informan aparte', () => {
    const r = resumenLeadTime(ev)
    expect(r).toMatchObject({ total: 4, entregadas: 2, abiertas: 2, excluidas: 0 })
    expect(r.p50).toBeCloseTo(6.5, 6)
    expect(r.edadMedianaAbiertas).toBeCloseTo(11, 6)
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
  it('cumplimiento por análisis: agrupa por el análisis que fijó el plazo', () => {
    const ev2 = evaluarTodas(lista, hitos, 'concretado', { QUITECA: 5, 'QUITECA|FDL': 8 }, AHORA)
    const por = cumplimientoPorAnalisis(ev2)
    expect(por.map((x) => x.etiqueta).sort()).toEqual(['QUITECA · FDL', 'QUITECA · plazo general'])
    const fdl = por.find((x) => x.analisis === 'FDL')
    expect(fdl).toMatchObject({ plazo: 8, total: 1 })
    expect(fdl?.r.cumplio).toBe(1)
  })
  it('serie por mes de emisión; con pocos casos no inventa un punto', () => {
    const s = seriePorMes(ev)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ mes: '2026-09', n: 4, p50: null })
    expect(s[0].pct).toBeCloseTo(33.3, 1)
  })
  it('flujograma: cada solicitud está en el último punto que alcanzó', () => {
    const [uno, dos, tres, cuatro] = ev
    expect(nodoActual(uno)).toBe('observado')
    expect(nodoActual(dos)).toBe('informe')
    expect(nodoActual(tres)).toBe('analisis')
    expect(nodoActual(cuatro)).toBe('analisis')
    expect(alcanzados(uno)).toMatchObject({ emitida: true, recepcion: true, informe: true, cliente: true, sistema: true, observado: true })
    // «cliente» y «sistema» van al mismo nivel: haber llegado a uno no activa el otro
    expect(alcanzados(dos)).toMatchObject({ cliente: false, sistema: false })
    // «Reporte observado»: basta con que el informe esté en Report, aunque ningún cliente lo haya abierto
    expect(alcanzados({ ...uno, hitos: { ...uno.hitos!, observado: null } }).observado).toBe(true)
    const r = resumenFlujo(ev)
    expect(r.emitida.alcanzaron).toBe(4)
    expect(r.informe.alcanzaron).toBe(2)
    expect(r.observado).toMatchObject({ alcanzaron: 1, ahoraAqui: 1 })
    expect(r.analisis.ahoraAqui).toBe(2)
  })
  it('una solicitud recién emitida aún no llegó a la recepción estimada', () => {
    const recien = evaluar(sol({ archivo: 'x', emitida_en: new Date(AHORA - 3 * 3600_000).toISOString() }), null, 'concretado', { QUITECA: 5 }, AHORA)
    expect(recien.recibida).toBe(false)
    expect(nodoActual(recien)).toBe('emitida')
  })
})

describe('atraso: cuánto se pasó cada solicitud de su plazo', () => {
  const e = (veredicto: EvaluadaEntrega['veredicto'], plazo: number | null, dias: number | null, edad: number) =>
    ({ veredicto, plazo, dias, edad, entregada: dias != null, sol: {} }) as unknown as EvaluadaEntrega

  it('tarde: lo que tardó de más; vencida: lo que lleva de más; el resto no tiene atraso', () => {
    expect(atrasoDe(e('tarde', 3, 5.5, 6))).toBe(2.5)
    expect(atrasoDe(e('vencida', 3, null, 4))).toBe(1)
    expect(atrasoDe(e('cumplio', 3, 2, 2))).toBeNull()
    expect(atrasoDe(e('plazo', 3, null, 1))).toBeNull()
    expect(atrasoDe(e('sin_plazo', null, null, 9))).toBeNull()
  })

  it('resume y ordena los peores atrasos', () => {
    const lista = [e('tarde', 3, 5, 5), e('vencida', 3, null, 9), e('cumplio', 3, 1, 1), e('tarde', 2, 3, 3)]
    expect(resumenAtraso(lista)).toEqual({ n: 3, mediana: 2, maximo: 6 })
    expect(peoresAtrasos(lista, 2).map((x) => x.atraso)).toEqual([6, 2])
    expect(resumenAtraso([e('cumplio', 3, 1, 1)])).toEqual({ n: 0, mediana: null, maximo: null })
  })
})
