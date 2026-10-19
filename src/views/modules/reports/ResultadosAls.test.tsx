import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { InformeAlsVista, ResultadoAlsVista } from '@/features/reportes/lib/lineaTiempoAls'
import { ResultadosAls } from './ResultadosAls'

const COLT = { codigo: 'COLT', nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI = { codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const sin = (a: typeof COLT): ResultadoAlsVista => ({ ...a, texto: '<1', valor: null, detectado: false })
const con = (a: typeof COLT, v: number): ResultadoAlsVista => ({ ...a, texto: String(v), valor: v, detectado: true })
// Llegan de la base en cualquier orden; los dos analitos en orden cambiado en uno de los informes.
const INFORMES: InformeAlsVista[] = [
  { nro: '496563', fecha: '2026-10-30', resultados: [sin(ECOLI), sin(COLT)] },
  { nro: '496251', fecha: '2026-10-01', resultados: [con(ECOLI, 50), con(COLT, 67)] },
  { nro: '496252', fecha: '2026-09-30', resultados: [con(COLT, 49), con(ECOLI, 15)] },
]

describe('ResultadosAls', () => {
  it('la tabla lleva un informe por fila (el más nuevo arriba) y una columna por analito con su unidad', () => {
    render(<ResultadosAls informes={INFORMES} />)
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
    render(<ResultadosAls informes={INFORMES} />)
    const fila = within(screen.getByRole('table')).getAllByRole('row')[1]
    expect(within(fila).getAllByText('<1')).toHaveLength(2)
  })

  it('la línea de tiempo corta el eje cuando pasan días sin muestras y dice cuántos', () => {
    render(<ResultadosAls informes={INFORMES} />)
    expect(screen.getAllByText('29 días después').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /Línea de tiempo/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
  })

  it('cada punto dice su informe, su fecha y su valor al pasar el mouse', () => {
    const { container } = render(<ResultadosAls informes={INFORMES} />)
    const titulos = [...container.querySelectorAll('title')].map((t) => t.textContent)
    expect(titulos).toContain('496251 · 01-10-2026 · Coliformes Totales: 67 UFC/100 mL')
    expect(titulos).toContain('496563 · 30-10-2026 · Escherichia coli: <1 UFC/100 mL')
  })

  it('con analitos de otra unidad hay una serie de tiempo por unidad', () => {
    const ALIM = { codigo: 'COLA', nombre: 'Coliformes Totales', unidad: 'UFC/g', orden: 3 }
    render(<ResultadosAls informes={[{ nro: '1', fecha: '2026-10-01', resultados: [con(COLT, 5), con(ALIM, 300)] }]} />)
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/g/ })).toBeTruthy()
  })
})
