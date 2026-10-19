import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { InformeVista, ResultadoVista } from '@/features/reportes/lib/lineaTiempoInformes'
import { ResultadosPorInforme } from './ResultadosPorInforme'

const COLT = { codigo: 'COLT', nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI = { codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const sin = (a: typeof COLT): ResultadoVista => ({ ...a, texto: '<1', valor: null, detectado: false })
const con = (a: typeof COLT, v: number): ResultadoVista => ({ ...a, texto: String(v), valor: v, detectado: true })
// Llegan de la base en cualquier orden; los dos analitos en orden cambiado en uno de los informes.
const INFORMES: InformeVista[] = [
  { nro: '496563', fecha: '2026-10-30', resultados: [sin(ECOLI), sin(COLT)] },
  { nro: '496251', fecha: '2026-10-01', resultados: [con(ECOLI, 50), con(COLT, 67)] },
  { nro: '496252', fecha: '2026-09-30', resultados: [con(COLT, 49), con(ECOLI, 15)] },
]

describe('ResultadosPorInforme', () => {
  it('la tabla lleva un informe por fila (el más nuevo arriba) y una columna por analito con su unidad', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" />)
    const tabla = screen.getByRole('table')
    const columnas = within(tabla).getAllByRole('columnheader').map((c) => c.textContent)
    expect(columnas[0]).toBe('Fecha de muestreo')
    expect(columnas[1]).toBe('N° de informe')
    expect(columnas[2]).toContain('COLIFORMES TOTALES')
    expect(columnas[2]).toContain('UFC/100 mL')
    expect(columnas[3]).toContain('ESCHERICHIA COLI')
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(3)
    expect(filas.map((f) => within(f).getAllByRole('cell')[1].textContent)).toEqual(['496563', '496251', '496252'])
    // Coliformes primero y E. coli después, aunque el informe 496563 los traiga al revés.
    const ultima = within(filas[1]).getAllByRole('cell').map((c) => c.textContent)
    expect(ultima.slice(2)).toEqual(['67', '50'])
  })

  it('lo que no se detectó sale como «<1» y lo detectado con su valor', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" />)
    const fila = within(screen.getByRole('table')).getAllByRole('row')[1]
    expect(within(fila).getAllByText('<1')).toHaveLength(2)
  })

  it('la línea de tiempo corta el eje cuando pasan días sin muestras y dice cuántos', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" />)
    expect(screen.getAllByText('29 días después').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /Línea de tiempo/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
  })

  it('cada punto dice su informe, su fecha y su valor al pasar el mouse', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" />)
    const titulos = [...container.querySelectorAll('title')].map((t) => t.textContent)
    expect(titulos).toContain('496251 · 01-10-2026 · Coliformes Totales: 67 UFC/100 mL')
    expect(titulos).toContain('496563 · 30-10-2026 · Escherichia coli: <1 UFC/100 mL')
  })

  it('con analitos de otra unidad hay una serie de tiempo por unidad', () => {
    const ALIM = { codigo: 'COLA', nombre: 'Coliformes Totales', unidad: 'UFC/g', orden: 3 }
    render(<ResultadosPorInforme laboratorio="als" informes={[{ nro: '1', fecha: '2026-10-01', resultados: [con(COLT, 5), con(ALIM, 300)] }]} />)
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/g/ })).toBeTruthy()
  })
})

// ── Diagnofruit: el mismo componente, con sus cinco patógenos, la zona de muestreo y «BLD» ──
const PAT = {
  LEV: { codigo: 'LEV', nombre: 'Levaduras', unidad: 'UFC/mL', orden: 1 },
  BOT: { codigo: 'BOT', nombre: 'Botrytis', unidad: 'conidia/mL', orden: 2 },
  GEO: { codigo: 'GEO', nombre: 'Geotrichum', unidad: 'esporas/mL', orden: 4 },
}
const bld = (a: typeof PAT.LEV): ResultadoVista => ({ ...a, texto: 'BLD', valor: null, detectado: false })
const hay = (a: typeof PAT.LEV, texto: string, valor: number | null): ResultadoVista => ({ ...a, texto, valor, detectado: true })
const DIAGNO: InformeVista[] = [
  { nro: '253522-DIAG0007', fecha: '2026-10-01', detalle: 'Pozo vaciado', resultados: [bld(PAT.LEV), hay(PAT.BOT, '5,2', 5.2), bld(PAT.GEO)] },
  { nro: '253521-DIAG0003', fecha: '2026-10-01', detalle: null, resultados: [hay(PAT.LEV, '>100', 100), hay(PAT.BOT, '4,66', 4.66), hay(PAT.GEO, '49,91', 49.91)] },
]

describe('ResultadosPorInforme con Diagnofruit', () => {
  it('la tabla trae la zona de muestreo y una columna por patógeno con su unidad', () => {
    render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" />)
    const columnas = within(screen.getByRole('table')).getAllByRole('columnheader').map((c) => c.textContent)
    expect(columnas[2]).toBe('Zona de muestreo')
    expect(columnas[3]).toContain('LEVADURAS')
    expect(columnas[3]).toContain('UFC/mL')
    expect(columnas[4]).toContain('BOTRYTIS')
    expect(columnas[5]).toContain('GEOTRICHUM')
    const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    // el más nuevo (por N°) arriba, y su zona; el otro sin zona queda en «—»
    expect(within(filas[0]).getAllByRole('cell')[2].textContent).toBe('Pozo vaciado')
    expect(within(filas[1]).getAllByRole('cell')[2].textContent).toBe('—')
    expect(within(filas[1]).getAllByRole('cell').slice(3).map((c) => c.textContent)).toEqual(['>100', '4,66', '49,91'])
  })

  it('la nota habla de BLD, no de «<1»', () => {
    render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" />)
    expect(screen.getByText(/«BLD»: bajo el límite de detección/)).toBeTruthy()
    expect(screen.queryByText(/«<1»/)).toBeNull()
  })

  it('hay una serie de tiempo por unidad (UFC/mL, conidia/mL y esporas/mL) y los informes se rotulan por su OT', () => {
    const { container } = render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" />)
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*conidia\/mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*esporas\/mL/ })).toBeTruthy()
    const rotulos = [...container.querySelectorAll('svg text')].map((t) => t.textContent)
    expect(rotulos).toContain('DIAG0003')
    expect(rotulos).not.toContain('253521-DIAG0003')
    // un valor «>100» se dibuja como detectado, con su texto
    expect(rotulos).toContain('>100')
  })
})
