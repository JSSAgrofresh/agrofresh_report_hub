import { describe, expect, it } from 'vitest'
import { limitesDeEspecie } from './limitesResiduales'
import { fichaSimulada, generarDatosSimulados } from './simulacion'
import type { Observacion } from './tipos'

const HOY = new Date(Date.UTC(2026, 8, 28))

describe('generarDatosSimulados', () => {
  it('genera exactamente la cantidad de resultados pedida', () => {
    expect(generarDatosSimulados(1000, 1, HOY).filas).toHaveLength(1000)
    expect(generarDatosSimulados(37, 1, HOY).filas).toHaveLength(37)
  })

  it('con la misma semilla da los mismos datos', () => {
    expect(generarDatosSimulados(200, 7, HOY)).toEqual(generarDatosSimulados(200, 7, HOY))
  })

  it('nunca reutiliza ids de solicitudes reales (siempre negativos) y los marca como simulados', () => {
    const { filas, totalSolicitudes } = generarDatosSimulados(1000, 3, HOY)
    expect(filas.every((f) => f.solicitud_id < 0)).toBe(true)
    expect(filas.every((f) => f.nro_solicitud.startsWith('SIM-'))).toBe(true)
    expect(filas.every((f) => f.cliente?.includes('(Sim.)'))).toBe(true)
    expect(totalSolicitudes).toBe(new Set(filas.map((f) => f.solicitud_id)).size)
    expect(totalSolicitudes).toBeLessThan(1000)
  })

  it('las fechas caen en los 12 meses anteriores y semana/mes calzan con la fecha', () => {
    const { filas } = generarDatosSimulados(500, 11, HOY)
    filas.forEach((f) => {
      expect(f.fecha_muestreo! <= '2026-09-28').toBe(true)
      expect(f.fecha_muestreo! > '2025-09-28').toBe(true)
      expect(f.mes).toBe(Number(f.fecha_muestreo!.slice(5, 7)))
      expect(f.semana_muestreo).toBeGreaterThanOrEqual(1)
      expect(f.semana_muestreo).toBeLessThanOrEqual(53)
    })
  })

  it('una solicitud no repite ingrediente', () => {
    const { filas } = generarDatosSimulados(1000, 5, HOY)
    const vistos = new Set<string>()
    filas.forEach((f) => {
      const clave = `${f.solicitud_id}|${f.ingrediente}`
      expect(vistos.has(clave)).toBe(false)
      vistos.add(clave)
    })
  })

  it('los residuos usan los límites REALES de su especie: solo sus analitos y casi todo dentro del rango', () => {
    const { filas: todas } = generarDatosSimulados(1000, 9, HOY)
    const filas = todas.filter((f) => f.laboratorio === 'Agrofresh')
    const conValor = filas.filter((f) => f.valor_num != null)
    let dentro = 0
    for (const f of conValor) {
      const rangos = limitesDeEspecie(f.especie)
      // Nunca una especie sin tabla ni un analito que la tabla no evalúa para ella.
      expect(rangos).not.toBeNull()
      const r = rangos![f.ingrediente as string]
      expect(r).toBeDefined()
      const v = Number(f.valor_num)
      if (v >= r.min && v <= r.max) dentro++
    }
    const pct = dentro / conValor.length
    expect(pct).toBeGreaterThan(0.92)
    expect(pct).toBeLessThan(1)
    // Hay resultados "ND", sin valor numérico, como en los datos reales.
    expect(filas.some((f) => f.valor_num == null && f.valor_texto === 'ND')).toBe(true)
  })

  it('los límites que acompañan a los datos son los de la tabla, por especie', () => {
    const { analitos, limites } = generarDatosSimulados(300, 9, HOY)
    const fdl = analitos.find((a) => a.codigo === 'FDL' && a.laboratorio === 'Agrofresh')!
    const cerezas = limites.find((l) => l.analito_id === fdl.id && l.especie === 'Cerezas')!
    expect([cerezas.limite_min, cerezas.limite_max]).toEqual([0.7, 5])
  })
})

describe('analitos simulados', () => {
  it('incluyen todos los de la lista conocida, TEBU entre ellos, y cada uno aparece en los datos', () => {
    const { filas, analitos } = generarDatosSimulados(1000, 9, HOY)
    expect(analitos.map((a) => a.codigo)).toEqual(expect.arrayContaining(['IMZ', 'FDL', 'PYR', 'TBZ', 'DPA', 'AZOX', 'TEBU']))
    expect(new Set(filas.map((f) => f.ingrediente))).toContain('TEBU')
  })
})

describe('simulación completa', () => {
  it('por defecto son 300 resultados repartidos entre residuos, FSMA y fitopatología', () => {
    const { filas } = generarDatosSimulados(undefined, 4, HOY)
    expect(filas).toHaveLength(300)
    const por = (lab: string) => filas.filter((f) => f.laboratorio === lab)
    expect(por('Agrofresh')).toHaveLength(180)
    expect(por('ALS (Corthon)')).toHaveLength(60)
    expect(por('Diagnofruit')).toHaveLength(60)
  })

  it('FSMA y fitopatología traen sus analitos, con no detectados («<1», «ND») y detectados', () => {
    const { filas, analitos } = generarDatosSimulados(300, 4, HOY)
    const als = filas.filter((f) => f.laboratorio === 'ALS (Corthon)')
    const fito = filas.filter((f) => f.laboratorio === 'Diagnofruit')
    expect(new Set(als.map((f) => f.ingrediente))).toEqual(new Set(['COLIF100', 'ECOLI100']))
    expect(new Set(fito.map((f) => f.ingrediente))).toEqual(new Set(['LEV', 'BOT', 'ALT', 'GEO', 'PEN']))
    expect(als.some((f) => f.valor_texto === '<1')).toBe(true)
    expect(als.some((f) => f.valor_num != null)).toBe(true)
    expect(fito.some((f) => f.valor_texto === 'ND')).toBe(true)
    expect(fito.some((f) => f.valor_num != null)).toBe(true)
    // ALS no informa especie; Diagnofruit sí.
    expect(als.every((f) => f.especie == null)).toBe(true)
    expect(fito.every((f) => f.especie != null)).toBe(true)
    ;[...als, ...fito].forEach((f) => expect(analitos.some((a) => a.codigo === f.ingrediente)).toBe(true))
  })
})

describe('fichaSimulada', () => {
  const { filas, analitos } = generarDatosSimulados(300, 7)
  const observaciones = (id: number): Observacion[] =>
    filas
      .filter((f) => f.solicitud_id === id)
      .map((f) => ({
        solicitudId: f.solicitud_id,
        nroSolicitud: f.nro_solicitud ?? '',
        ingrediente: f.ingrediente,
        ppm: f.valor_num == null ? null : Number(f.valor_num),
        valorTexto: f.valor_texto,
        fecha: f.fecha_muestreo,
        cliente: f.cliente,
        planta: f.planta,
        tipoAplicacion: f.tipo_aplicacion,
        tipoServicio: f.tipo_servicio,
        posicionMuestreo: f.posicion_muestreo,
        laboratorio: f.laboratorio,
        crop: f.especie,
        variedad: f.variedad,
        semana: f.semana_muestreo,
        mes: f.mes,
      }))

  it('arma la misma forma que la ficha real: resultados con unidad, datos del informe y sin PDF', () => {
    const f = fichaSimulada(observaciones(-1), analitos)
    expect(f.solicitud.nro_solicitud).toBe('SIM-0001')
    expect(f.resultados.length).toBeGreaterThan(0)
    expect(f.resultados.every((r) => r.unidad !== '')).toBe(true)
    expect(f.solicitud.fecha_informe).not.toBeNull()
    expect(f.pdf.disponible).toBe(false)
  })

  it('el mismo informe siempre muestra lo mismo', () => {
    expect(fichaSimulada(observaciones(-3), analitos)).toEqual(fichaSimulada(observaciones(-3), analitos))
  })
})
