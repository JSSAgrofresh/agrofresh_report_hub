import { describe, expect, it } from 'vitest'
import { estadoDe, porSemana, topClientes, totales } from './resumen'
import type { SolicitudAuditoria } from './tipos'

function sol(extra: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria {
  return {
    archivo: 'a.xlsx',
    numero_solicitud: 'OT-1',
    laboratorio: 'Quiteca',
    sold_to: 'Dole',
    ship_to: 'Codegua',
    especie: 'Cerezas',
    fecha_solicitud: null,
    fecha_muestreo: null,
    emitida_en: '2026-09-28T10:00:00',
    informe: null,
    en_report: false,
    concretada: false,
    ...extra,
  }
}

const informe = { id: 1, nro_informe: 'X', nombre_archivo: 'x.pdf', ruta: 'Q/C/x.pdf', cargado_en: null, fecha_envio: null }

describe('estadoDe', () => {
  it('concretada exige PDF y Report', () => {
    expect(estadoDe(sol({ informe, en_report: true, concretada: true }))).toBe('concretada')
  })
  it('con PDF pero sin Report NO está concretada', () => {
    expect(estadoDe(sol({ informe, en_report: false }))).toBe('sin_report')
  })
  it('sin PDF está pendiente', () => {
    expect(estadoDe(sol())).toBe('pendiente')
  })
})

describe('totales', () => {
  it('cuenta cada estado y el porcentaje', () => {
    const t = totales([
      sol({ informe, en_report: true, concretada: true }),
      sol({ informe }),
      sol(),
      sol(),
    ])
    expect(t).toMatchObject({ emitidas: 4, concretadas: 1, sinReport: 1, pendientes: 2, porcentajeConcretado: 25 })
  })
  it('sin solicitudes no divide por cero', () => {
    expect(totales([]).porcentajeConcretado).toBe(0)
  })
})

describe('porSemana', () => {
  it('agrupa de lunes a domingo', () => {
    // 2026-09-28 es lunes; 2026-10-04 es domingo de la misma semana.
    const p = porSemana([
      sol({ emitida_en: '2026-09-28T00:10:00' }),
      sol({ emitida_en: '2026-10-04T23:50:00' }),
      sol({ emitida_en: '2026-10-05T08:00:00' }),
    ])
    expect(p.map((x) => [x.inicio, x.emitidas])).toEqual([
      ['2026-09-28', 2],
      ['2026-10-05', 1],
    ])
  })
  it('rellena con cero las semanas sin solicitudes', () => {
    const p = porSemana([sol({ emitida_en: '2026-09-07T10:00:00' }), sol({ emitida_en: '2026-09-28T10:00:00' })])
    expect(p.map((x) => x.emitidas)).toEqual([1, 0, 0, 1])
  })
  it('cuenta las concretadas dentro de la semana de emisión', () => {
    const p = porSemana([
      sol({ concretada: true, informe, en_report: true }),
      sol(),
    ])
    expect(p[0]).toMatchObject({ emitidas: 2, concretadas: 1 })
  })
  it('etiqueta con la semana ISO', () => {
    expect(porSemana([sol({ emitida_en: '2026-09-28T10:00:00' })])[0].etiqueta).toBe('S40 · 28 sep')
  })
  it('usa fecha_solicitud si no hay marca de emisión, y omite las que no tienen ninguna', () => {
    const p = porSemana([sol({ emitida_en: null, fecha_solicitud: '2026-09-29' }), sol({ emitida_en: null })])
    expect(p).toHaveLength(1)
    expect(p[0].emitidas).toBe(1)
  })
  it('se queda con las últimas semanas pedidas', () => {
    const p = porSemana(
      [sol({ emitida_en: '2026-01-05T10:00:00' }), sol({ emitida_en: '2026-09-28T10:00:00' })],
      4,
    )
    expect(p).toHaveLength(4)
    expect(p[3].inicio).toBe('2026-09-28')
  })
  it('sin datos, no hay semanas', () => {
    expect(porSemana([])).toEqual([])
  })
})

describe('topClientes', () => {
  it('ordena por solicitudes y corta en n', () => {
    const t = topClientes(
      [sol({ sold_to: 'A' }), sol({ sold_to: 'B' }), sol({ sold_to: 'B' }), sol({ sold_to: 'C' })],
      2,
    )
    expect(t.map((c) => [c.cliente, c.solicitudes])).toEqual([['B', 2], ['A', 1]])
  })
  it('agrupa sin cliente y cuenta concretadas', () => {
    const t = topClientes([sol({ sold_to: null, concretada: true }), sol({ sold_to: '  ' })])
    expect(t).toEqual([{ cliente: 'Sin cliente', solicitudes: 2, concretadas: 1 }])
  })
})
