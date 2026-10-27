import { describe, expect, it } from 'vitest'
import { generarDatosSimulados } from './simulacion'

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

  it('cada ingrediente tiene su límite ficticio y la mayoría de los valores cae dentro', () => {
    const { filas: todas, analitos, limites } = generarDatosSimulados(1000, 9, HOY)
    const filas = todas.filter((f) => f.laboratorio === 'Agrofresh')
    expect(analitos.every((a) => a.nombre.includes('simulado'))).toBe(true)
    analitos.filter((a) => a.laboratorio === 'Agrofresh').forEach((a) => expect(limites.some((l) => l.analito_id === a.id)).toBe(true))
    const conValor = filas.filter((f) => f.valor_num != null)
    const dentro = conValor.filter((f) => {
      const a = analitos.find((x) => x.codigo === f.ingrediente && x.laboratorio === 'Agrofresh')!
      const l = limites.find((x) => x.analito_id === a.id)!
      return (
        Number(f.valor_num) >= Number(l.limite_min) && Number(f.valor_num) <= Number(l.limite_max)
      )
    })
    const pct = dentro.length / conValor.length
    expect(pct).toBeGreaterThan(0.75)
    expect(pct).toBeLessThan(0.99)
    // Hay resultados "ND", sin valor numérico, como en los datos reales.
    expect(filas.some((f) => f.valor_num == null && f.valor_texto === 'ND')).toBe(true)
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
