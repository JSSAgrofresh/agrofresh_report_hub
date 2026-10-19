import { describe, expect, it } from 'vitest'
import {
  colorDeAnalitoAls, escalaBonita, hayCorte, modeloLinea, posicionesX, radioDeValor, valorDeTexto,
  type InformeAlsVista, type ResultadoAlsVista,
} from './lineaTiempoAls'

const COLT = { codigo: 'COLT', nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI = { codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const res = (a: typeof COLT, texto: string, valor: number | null, detectado: boolean): ResultadoAlsVista => ({ ...a, texto, valor, detectado })
const inf = (nro: string, fecha: string | null, c: string | number, e: string | number): InformeAlsVista => ({
  nro,
  fecha,
  resultados: [
    typeof c === 'number' ? res(COLT, String(c), c, true) : res(COLT, c, null, false),
    typeof e === 'number' ? res(ECOLI, String(e), e, true) : res(ECOLI, e, null, false),
  ],
})

// Los informes reales de ALS de octubre 2026, desordenados a propósito.
const INFORMES = [
  inf('496563', '2026-10-30', '<1', '<1'),
  inf('496251', '2026-10-01', 67, 50),
  inf('496252', '2026-09-30', 49, 15),
  inf('496250', '2026-10-01', 41, 33),
  inf('496561', '2026-09-30', '<1', '<1'),
]

describe('modeloLinea', () => {
  const m = modeloLinea(INFORMES)

  it('ordena de más antiguo a más nuevo, y dentro del día por N° (numérico)', () => {
    expect(m.informes.map((i) => i.nro)).toEqual(['496252', '496561', '496250', '496251', '496563'])
  })

  it('agrupa por día de muestreo y cuenta los días entre un día y el anterior', () => {
    expect(m.dias.map((d) => [d.etiqueta, d.desde, d.hasta, d.diasDesdeAnterior])).toEqual([
      ['30-09-2026', 0, 1, null],
      ['01-10-2026', 2, 3, 1],
      ['30-10-2026', 4, 4, 29],
    ])
  })

  it('solo corta el eje cuando pasa más de un día sin muestras', () => {
    expect(m.dias.map(hayCorte)).toEqual([false, false, true])
  })

  it('los analitos van en su orden fijo, con su unidad, y Coliformes es verde y E. coli amarillo', () => {
    expect(m.analitos.map((a) => a.nombre)).toEqual(['Coliformes Totales', 'Escherichia coli'])
    expect(m.unidades).toEqual(['UFC/100 mL'])
    expect(m.analitos[0].color.fill).toBe('#6dad3c')
    expect(m.analitos[1].color.fill).toBe('#e8c32e')
  })

  it('un informe sin fecha va al final, en su propio grupo y sin días de distancia', () => {
    const c = modeloLinea([inf('1', null, 5, '<1'), inf('2', '2026-10-01', '<1', '<1')])
    expect(c.informes.map((i) => i.fechaTxt)).toEqual(['01-10-2026', 'Sin fecha'])
    expect(c.dias[1].diasDesdeAnterior).toBeNull()
  })

  it('sin informes no falla', () => {
    expect(modeloLinea([])).toEqual({ informes: [], analitos: [], unidades: [], dias: [] })
  })
})

describe('posicionesX', () => {
  it('deja un hueco extra solo donde el eje se corta', () => {
    const { xs } = posicionesX(modeloLinea(INFORMES), 100, 90, 110)
    expect(xs[1] - xs[0]).toBe(90)
    expect(xs[3] - xs[2]).toBe(90)
    expect(xs[4] - xs[3]).toBe(90 + 110)
  })
})

describe('valorDeTexto', () => {
  it('«>2400» es un valor medido; «<1», «ND» y «Presente» no dan número', () => {
    expect(valorDeTexto('>2400')).toBe(2400)
    expect(valorDeTexto('≥ 1,5')).toBe(1.5)
    expect(valorDeTexto('<1')).toBeNull()
    expect(valorDeTexto('ND')).toBeNull()
    expect(valorDeTexto(null)).toBeNull()
  })
})

describe('escalas', () => {
  it('el eje vertical usa números redondos', () => {
    expect(escalaBonita(67)).toEqual({ max: 80, marcas: [0, 20, 40, 60, 80] })
    expect(escalaBonita(50)).toEqual({ max: 60, marcas: [0, 20, 40, 60] })
    expect(escalaBonita(3)).toEqual({ max: 3, marcas: [0, 1, 2, 3] })
    expect(escalaBonita(0).max).toBe(4)
  })

  it('el radio crece con el valor y nunca se pasa del máximo', () => {
    expect(radioDeValor(15, 67)).toBeLessThan(radioDeValor(67, 67))
    expect(radioDeValor(67, 67)).toBeCloseTo(28)
    expect(radioDeValor(500, 67)).toBeCloseTo(28)
    expect(radioDeValor(null, 67)).toBe(14)
  })

  it('un analito que la tabla no conoce sale gris, no con el color de otro', () => {
    expect(colorDeAnalitoAls(99).fill).toBe('#77837b')
  })
})
