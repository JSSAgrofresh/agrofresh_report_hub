import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import type { Observacion } from '@/features/reportes/lib/tipos'
import { DonaFueraDeRango } from './DonaFueraDeRango'
import { ResultadosPorCliente } from './ResultadosPorCliente'

// Cerezas: FDL 0,7–5 · PYR 1–4.
let id = 0
const inf = (cliente: string, crop: string, ...res: [string, number][]): InformeConPuntos => {
  id += 1
  return { solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos: res.map(([a, v]) => ({ ingrediente: a, ppm: v, cliente, crop }) as Observacion) }
}
const DATOS = [
  inf('Dole', 'Cerezas', ['FDL', 6]),
  inf('Dole', 'Cerezas', ['FDL', 0.1]),
  inf('Dole', 'Cerezas', ['FDL', 2]),
  inf('Sur', 'Cerezas', ['FDL', 1]),
  inf('Sur', 'Cerezas', ['FDL', 1]),
  inf('Sur', 'Cerezas', ['PYR', 5]),
  inf('Frutas', 'Ciruela', ['FDL', 9]),
]

describe('ResultadosPorCliente', () => {
  it('una barra por cliente, primero el que más informes tiene fuera de rango', () => {
    render(<ResultadosPorCliente informes={DATOS} soloFuera={false} />)
    const filas = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('fuera'))
    expect(filas.map((f) => f.querySelector('button')?.textContent)).toEqual(['Dole', 'Frutas', 'Sur'])
    expect(within(filas[0]).getByText(/de 3/)).toBeTruthy()
    expect(screen.getByText('Dentro del límite')).toBeTruthy()
  })
  it('con «solo fuera de rango» no hay dentro ni clientes limpios', () => {
    render(<ResultadosPorCliente informes={[...DATOS, inf('Limpio', 'Cerezas', ['FDL', 2])]} soloFuera />)
    expect(screen.queryByText('Dentro del límite')).toBeNull()
    expect(screen.queryByText('Limpio')).toBeNull()
  })
  it('clic en un cliente lo elige', () => {
    const elegir = vi.fn()
    render(<ResultadosPorCliente informes={DATOS} soloFuera={false} onElegirCliente={elegir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sur' }))
    expect(elegir).toHaveBeenCalledWith('Sur')
  })
})

describe('DonaFueraDeRango', () => {
  it('sin especie filtrada es por especie; el clic abre cuánto se pasaron, por informe y por analito', () => {
    render(<DonaFueraDeRango informes={DATOS} soloFuera={false} especieFiltrada={null} />)
    expect(screen.getByRole('img', { name: 'Informes por especie' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Cerezas/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText('OT-1')).toBeTruthy()
    expect(within(dialogo).getAllByText('+1,00 ppm')).toHaveLength(2)
    expect(within(dialogo).getByText('−0,60 ppm')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('tab', { name: 'Por analito' }))
    expect(within(dialogo).getByText('Mayor desvío')).toBeTruthy()
  })
  it('con una especie filtrada pasa a ser por analito', () => {
    render(<DonaFueraDeRango informes={DATOS.slice(0, 6)} soloFuera={false} especieFiltrada="Cerezas" />)
    expect(screen.getByRole('img', { name: 'Resultados por analito' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /FDL/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /PYR/ })).toBeTruthy()
  })
  it('con «solo fuera de rango» no aparece lo que está dentro', () => {
    render(<DonaFueraDeRango informes={[...DATOS, inf('X', 'Palta', ['FDL', 2])]} soloFuera especieFiltrada={null} />)
    expect(screen.queryByRole('button', { name: /Palta/ })).toBeNull()
  })
  it('desde el detalle se puede filtrar por la especie', () => {
    const elegir = vi.fn()
    render(<DonaFueraDeRango informes={DATOS} soloFuera={false} especieFiltrada={null} onElegirEspecie={elegir} />)
    fireEvent.click(screen.getByRole('button', { name: /Cerezas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar por Cerezas' }))
    expect(elegir).toHaveBeenCalledWith('Cerezas')
  })
})
