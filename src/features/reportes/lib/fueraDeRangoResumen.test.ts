import { describe, expect, it } from 'vitest'
import type { InformeConPuntos } from './graficoResiduales'
import type { Observacion } from './tipos'
import { agruparPorAnalito, detalleFuera, donaPorAnalito, donaPorEspecie, fueraPorCliente } from './fueraDeRangoResumen'

// Cerezas: FDL 0,7–5 · PYR 1–4 (tabla de límites residuales).
const punto = (ingrediente: string, ppm: number | null, cliente: string, crop = 'Cerezas') =>
  ({ ingrediente, ppm, cliente, crop }) as Observacion
let id = 0
const informe = (cliente: string, crop: string, ...res: [string, number | null][]): InformeConPuntos => {
  id += 1
  return { solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos: res.map(([a, v]) => punto(a, v, cliente, crop)) }
}

const DATOS = [
  informe('Dole', 'Cerezas', ['FDL', 6], ['PYR', 2]), // sobre
  informe('Dole', 'Cerezas', ['FDL', 0.1]), // bajo
  informe('Dole', 'Cerezas', ['FDL', 2]), // dentro
  informe('Dole', 'Cerezas', ['FDL', 6], ['PYR', 0.5]), // sobre y bajo: cuenta una vez, como sobre
  informe('Sur', 'Cerezas', ['FDL', 1], ['PYR', 2]), // dentro
  informe('Sur', 'Cerezas', ['FDL', 1]), // dentro
  informe('Sur', 'Cerezas', ['FDL', 6]), // sobre
  informe('Otro', 'Cerezas', ['FDL', 1]), // dentro
  informe('Sin tabla', 'Especie rara', ['FDL', 99]), // su especie no está en la tabla: no se evalúa
  informe('Sin valor', 'Cerezas', ['FDL', null]), // sin resultado numérico evaluable
]

describe('fueraPorCliente', () => {
  it('cada informe cuenta una vez y va primero quien tiene MÁS informes fuera, no quien tiene más informes', () => {
    const f = fueraPorCliente(DATOS, false)
    expect(f.map((x) => x.cliente)).toEqual(['Dole', 'Sur', 'Otro'])
    expect(f[0]).toMatchObject({ sobre: 2, bajo: 1, dentro: 1, fuera: 3, total: 4 })
    expect(f[1]).toMatchObject({ sobre: 1, bajo: 0, dentro: 2, fuera: 1, total: 3 })
    expect(f[2]).toMatchObject({ fuera: 0, total: 1 })
  })
  it('con «solo fuera de rango» se van los dentro y los clientes sin ningún fuera', () => {
    const f = fueraPorCliente(DATOS, true)
    expect(f.map((x) => x.cliente)).toEqual(['Dole', 'Sur'])
    expect(f[0]).toMatchObject({ dentro: 0, total: 3 })
  })
  it('un cliente con pocos informes pero casi todos fuera le gana a uno grande casi todo ok', () => {
    const chico = [informe('Chico', 'Cerezas', ['FDL', 6]), informe('Chico', 'Cerezas', ['FDL', 6])]
    const grande = Array.from({ length: 10 }, () => informe('Grande', 'Cerezas', ['FDL', 1]))
    expect(fueraPorCliente([...grande, ...chico], false).map((x) => x.cliente)).toEqual(['Chico', 'Grande'])
  })
})

describe('dona por especie y por analito', () => {
  it('por especie cuenta informes; la que no está en la tabla no entra', () => {
    expect(donaPorEspecie(DATOS)).toEqual([{ nombre: 'Cerezas', total: 8, fuera: 4 }])
  })
  it('por analito cuenta resultados evaluados', () => {
    const d = donaPorAnalito(DATOS)
    expect(d.find((x) => x.nombre === 'FDL')).toMatchObject({ total: 8, fuera: 4 })
    expect(d.find((x) => x.nombre === 'PYR')).toMatchObject({ total: 3, fuera: 1 })
  })
})

describe('detalle de lo que se pasó', () => {
  it('ordena por cuánto se pasó (con signo) y se puede acotar por especie o analito', () => {
    const d = detalleFuera(DATOS)
    expect(d.map((x) => [x.analito, x.desvio])).toEqual([
      ['FDL', 1], ['FDL', 1], ['FDL', 1], ['PYR', -0.5], ['FDL', -0.6],
    ].sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1]))))
    expect(detalleFuera(DATOS, { analito: 'PYR' })).toHaveLength(1)
    expect(detalleFuera(DATOS, { especie: 'cerezas' })).toHaveLength(5)
    expect(detalleFuera(DATOS, { especie: 'Especie rara' })).toHaveLength(0)
  })
  it('agrupa por analito con desvío promedio y mayor desvío con signo', () => {
    const g = agruparPorAnalito(detalleFuera(DATOS))
    const fdl = g.find((x) => x.analito === 'FDL')!
    expect(fdl).toMatchObject({ fuera: 4, sobre: 3, bajo: 1 })
    expect(fdl.mayorDesvio).toBeCloseTo(1)
    expect(fdl.desvioPromedio).toBeCloseTo((1 + 1 + 1 + 0.6) / 4)
    expect(g[0].analito).toBe('FDL')
  })
})
