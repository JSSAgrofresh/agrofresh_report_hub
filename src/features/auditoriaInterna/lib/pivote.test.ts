import { describe, expect, it } from 'vitest'
import { claveLab, diaDe, pivotePorMes, semanaDelMes } from './pivote'
import type { SolicitudAuditoria } from './tipos'

function sol(extra: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria {
  return {
    archivo: 'a.xlsx', numero_solicitud: 'OT-1', laboratorio: 'Quiteca', sold_to: 'Dole', ship_to: null,
    especie: null, variedad: null, tipo_servicio: 'Actimist', analitos: [], fecha_solicitud: null,
    fecha_muestreo: null, emitida_en: '2026-01-10T10:00:00', informe: null, en_report: false, concretada: false,
    ...extra,
  }
}
const muchas = (n: number, extra: Partial<SolicitudAuditoria>) => Array.from({ length: n }, () => sol(extra))

describe('claveLab', () => {
  it('ignora mayúsculas y reconoce solo los dos laboratorios', () => {
    expect(claveLab(sol({ laboratorio: 'AGROFRESH' }))).toBe('agrofresh')
    expect(claveLab(sol({ laboratorio: 'Quiteca' }))).toBe('quiteca')
    expect(claveLab(sol({ laboratorio: 'Otro' }))).toBeNull()
  })
})

describe('diaDe', () => {
  it('lee una fecha sin zona tal cual', () => {
    expect(diaDe('2026-01-31T23:30:00')).toEqual({ anio: 2026, mes: 1, dia: 31 })
    expect(diaDe('2026-02-01')).toEqual({ anio: 2026, mes: 2, dia: 1 })
  })
  it('pasa a hora de Chile una fecha con zona', () => {
    // 01-feb 01:00 UTC = 31-ene 22:00 en Chile (verano, UTC-3)
    expect(diaDe('2026-02-01T01:00:00Z')).toEqual({ anio: 2026, mes: 1, dia: 31 })
  })
  it('devuelve null si no hay fecha válida', () => {
    expect(diaDe(null)).toBeNull()
    expect(diaDe('basura')).toBeNull()
  })
})

describe('semanaDelMes', () => {
  it('las semanas empiezan el lunes (1-ene-2026 es jueves)', () => {
    expect(semanaDelMes({ anio: 2026, mes: 1, dia: 4 })).toBe(0) // domingo
    expect(semanaDelMes({ anio: 2026, mes: 1, dia: 5 })).toBe(1) // lunes
    expect(semanaDelMes({ anio: 2026, mes: 1, dia: 31 })).toBe(4)
  })
})

describe('pivotePorMes', () => {
  it('cuenta por mes, tipo y laboratorio con sus porcentajes', () => {
    const p = pivotePorMes([
      ...muchas(3, { laboratorio: 'Quiteca', tipo_servicio: 'Linea de proceso' }),
      ...muchas(7, { laboratorio: 'Agrofresh', tipo_servicio: 'Linea de proceso' }),
      ...muchas(1, { laboratorio: 'Quiteca', tipo_servicio: 'Actimist' }),
    ])
    const linea = p.meses[0].tipos['Línea de proceso']
    expect(linea).toMatchObject({ quiteca: 3, agrofresh: 7, total: 10, pctQuiteca: 30, pctAgrofresh: 70 })
    expect(p.meses[0].tipos['Actimist']).toMatchObject({ quiteca: 1, agrofresh: 0, pctQuiteca: 100 })
  })

  it('rellena los meses sin solicitudes y deja las semanas dentro de su mes', () => {
    const p = pivotePorMes([sol({ emitida_en: '2026-01-06T09:00:00' }), sol({ emitida_en: '2026-03-20T09:00:00' })])
    expect(p.meses.map((m) => m.etiqueta)).toEqual(['Enero 2026', 'Febrero 2026', 'Marzo 2026'])
    expect(p.meses[1].tipos['Actimist'].total).toBe(0)
    expect(p.semanas['2026-01'].map((s) => s.rango)).toEqual(['1 – 4 ene', '5 – 11 ene', '12 – 18 ene', '19 – 25 ene', '26 – 31 ene'])
    expect(p.semanas['2026-01'][1].tipos['Actimist'].total).toBe(1)
  })

  it('las semanas suman lo mismo que el mes', () => {
    const p = pivotePorMes([1, 4, 5, 12, 19, 26, 31].map((d) => sol({ emitida_en: `2026-01-${String(d).padStart(2, '0')}T08:00:00` })))
    const suma = p.semanas['2026-01'].reduce((n, s) => n + s.tipos['Actimist'].total, 0)
    expect(suma).toBe(p.meses[0].tipos['Actimist'].total)
    expect(suma).toBe(7)
  })

  it('no cuenta otros laboratorios, otros tipos ni solicitudes sin fecha', () => {
    const p = pivotePorMes([
      sol({ laboratorio: 'Otro' }), sol({ tipo_servicio: 'Consultoría' }), sol({ emitida_en: null, fecha_solicitud: null }),
    ])
    expect(p.meses).toEqual([])
    expect(p.totales['Actimist'].total).toBe(0)
  })
})

describe('simularSolicitudes', () => {
  it('genera lo pedido, marcado como simulado y sin fechas futuras', async () => {
    const { simularSolicitudes } = await import('./simulacion')
    const hoy = new Date(2026, 8, 30)
    const s = simularSolicitudes(1000, hoy)
    expect(s).toHaveLength(1000)
    expect(s.every((x) => x.sold_to?.includes('(Sim.)') && x.numero_solicitud?.startsWith('SIM-'))).toBe(true)
    expect(s.every((x) => (x.emitida_en ?? '') <= '2026-09-30T23:59:59')).toBe(true)
    expect(s.every((x) => x.concretada === (x.en_report && x.informe !== null))).toBe(true)
    expect(simularSolicitudes(50, hoy)).toEqual(simularSolicitudes(50, hoy))
  })
})

describe('áreas de la tabla', () => {
  it('Operaciones separa Línea de proceso y Actimist; R&D es solo RYD', async () => {
    const { TIPOS_DE_AREA } = await import('./pivote')
    expect(TIPOS_DE_AREA.operaciones).toEqual(['Línea de proceso', 'Actimist'])
    expect(TIPOS_DE_AREA.rd).toEqual(['RYD'])
  })
})
