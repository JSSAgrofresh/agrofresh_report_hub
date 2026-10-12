import { describe, expect, it } from 'vitest'
import { agrupar, clasificar, contar, pctFuera } from './fueraDeRango'
import type { Analito, LimiteAnalito, Observacion } from './tipos'

function obs(p: Partial<Observacion>): Observacion {
  return {
    solicitudId: 1, nroSolicitud: 'OT-1', ingrediente: 'FDL', ppm: 1, valorTexto: null, fecha: null, cliente: 'Dole',
    planta: 'Lontué', tipoAplicacion: 'Línea de proceso', tipoServicio: null, posicionMuestreo: null,
    laboratorio: 'QUITECA', crop: 'Cereza', variedad: null, semana: null, mes: null, ...p,
  }
}
const analito = { id: 1, codigo: 'FDL', laboratorio: 'QUITECA' } as Analito
const limite = (max: number | null, min: number | null = null): LimiteAnalito =>
  ({ id: 1, analito_id: 1, especie: '', tipo_servicio: '', limite_min: min, limite_central: null, limite_max: max })
const base = { analitos: [analito], sigma: 2 }

describe('clasificar por límite del analito', () => {
  it('sin límite cargado NO es «dentro»: queda «sin límite»', () => {
    const c = clasificar([obs({ ppm: 5 })], { ...base, criterio: 'limite', limites: [] })
    expect(c[0].clase).toBe('sin_limite')
  })
  it('sobre, bajo y dentro; el borde exacto está dentro', () => {
    const l = [limite(10, 2)]
    const c = clasificar([obs({ ppm: 11 }), obs({ ppm: 1 }), obs({ ppm: 10 }), obs({ ppm: 2 })], { ...base, criterio: 'limite', limites: l })
    expect(c.map((x) => x.clase)).toEqual(['sobre', 'bajo', 'dentro', 'dentro'])
  })
  it('los no detectados (sin valor numérico) no se clasifican', () => {
    const c = clasificar([obs({ ppm: null, valorTexto: 'ND' }), obs({ ppm: 3 })], { ...base, criterio: 'limite', limites: [limite(10)] })
    expect(c).toHaveLength(1)
  })
})

describe('clasificar por límite de control (promedio ± σ)', () => {
  const valores = [10, 10, 10, 10, 10, 10, 10, 10, 10, 30]
  it('marca el valor lejano como sobre el límite de control', () => {
    const c = clasificar(valores.map((ppm) => obs({ ppm })), { ...base, criterio: 'control', limites: [] })
    expect(c.filter((x) => x.clase === 'sobre')).toHaveLength(1)
    expect(c[9].clase).toBe('sobre')
  })
  it('cada analito tiene sus propios límites', () => {
    const lista = [
      ...valores.map((ppm) => obs({ ppm, ingrediente: 'FDL' })),
      ...[100, 100, 100, 100, 100].map((ppm) => obs({ ppm, ingrediente: 'IMZ' })),
    ]
    const c = clasificar(lista, { ...base, criterio: 'control', limites: [] })
    expect(c.filter((x) => x.obs.ingrediente === 'IMZ').every((x) => x.clase === 'dentro')).toBe(true)
  })
  it('con menos de 3 resultados de un analito no hay límites confiables', () => {
    const c = clasificar([obs({ ppm: 1 }), obs({ ppm: 99 })], { ...base, criterio: 'control', limites: [] })
    expect(c.every((x) => x.clase === 'sin_limite')).toBe(true)
  })
})

describe('porcentajes', () => {
  const lista = clasificar(
    [1, 2, 20, 30, 5].map((ppm) => obs({ ppm })).concat([obs({ ppm: 4, ingrediente: 'IMZ' })]),
    { ...base, criterio: 'limite', limites: [limite(10)] },
  )
  it('el % se calcula solo sobre lo evaluado', () => {
    // FDL: 3 dentro (1, 2, 5) y 2 sobre (20, 30); IMZ no tiene analito en el catálogo → sin límite
    const c = contar(lista, 2)
    expect(c).toMatchObject({ dentro: 3, sobre: 2, sin_limite: 1, nd: 2 })
    expect(pctFuera(c)).toBe(40)
  })
  it('agrupa y ordena de más a menos fuera de rango; sin evaluados queda al final', () => {
    const filas = agrupar(lista, 'analito')
    expect(filas.map((f) => f.clave)).toEqual(['FDL', 'IMZ'])
    expect(filas[0]).toMatchObject({ n: 5, evaluados: 5, pctFuera: 40 })
    expect(filas[1].pctFuera).toBeNull()
  })
  it('agrupa por cliente y trata lo vacío como «Sin dato»', () => {
    const filas = agrupar(clasificar([obs({ cliente: null, ppm: 50 }), obs({ cliente: 'Dole', ppm: 1 })], { ...base, criterio: 'limite', limites: [limite(10)] }), 'cliente')
    expect(filas.map((f) => f.clave).sort()).toEqual(['Dole', 'Sin dato'])
  })
})
