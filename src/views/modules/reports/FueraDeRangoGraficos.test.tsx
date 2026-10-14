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
  it('una barra por cliente con el % de sus informes; primero el que más informes tiene fuera de rango', () => {
    render(<ResultadosPorCliente informes={DATOS} soloFuera={false} />)
    const nombres = screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent)
    expect(nombres.map((n) => n?.replace('›', ''))).toEqual(['Dole', 'Frutas', 'Sur'])
    expect(screen.getByText('2 de 3', { exact: false })).toBeTruthy()
    expect(screen.getByText('Dentro del límite')).toBeTruthy()
    // Dole: 3 informes, 1 bajo, 1 sobre, 1 dentro: 33% cada uno.
    const barra = screen.getByRole('button', { name: /^Dole: ver cuánto se pasaron/ })
    expect(within(barra).getAllByText('33%')).toHaveLength(3)
  })
  it('con «solo fuera de rango» no hay dentro ni clientes limpios, y la barra reparte solo lo fuera', () => {
    render(<ResultadosPorCliente informes={[...DATOS, inf('Limpio', 'Cerezas', ['FDL', 2])]} soloFuera />)
    expect(screen.queryByText('Dentro del límite')).toBeNull()
    expect(screen.queryByText('Limpio')).toBeNull()
    const barra = screen.getByRole('button', { name: /^Dole: ver cuánto se pasaron/ })
    expect(within(barra).getAllByText('50%')).toHaveLength(2)
    expect(screen.getByText('2 de 3', { exact: false })).toBeTruthy()
  })
  it('con el mouse sobre un tramo sale el conteo', () => {
    render(<ResultadosPorCliente informes={DATOS} soloFuera={false} />)
    const barra = screen.getByRole('button', { name: /^Dole: ver cuánto se pasaron/ })
    fireEvent.mouseMove(within(barra).getAllByText('33%')[1], { clientX: 10, clientY: 10 })
    expect(screen.getByRole('status').textContent).toMatch(/Sobre el límite: 1 informe \(33%\)/)
  })
  it('el clic en el nombre despliega las semanas de ese cliente y al abrir otro se cierra el anterior', () => {
    const conSemana = (c: string, semana: number, v: number): InformeConPuntos => {
      id += 1
      return { solicitudId: id, nroSolicitud: `S-${id}`, fecha: `2026-10-${semana}`, puntos: [{ ingrediente: 'FDL', ppm: v, cliente: c, crop: 'Cerezas', semana } as Observacion] }
    }
    render(<ResultadosPorCliente informes={[conSemana('Dole', 41, 6), conSemana('Dole', 40, 2), conSemana('Sur', 39, 6)]} soloFuera={false} />)
    expect(screen.queryByText('Semana 41')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Dole/, expanded: false }))
    expect(screen.getByText('Semana 41')).toBeTruthy()
    expect(screen.getByText('Semana 40')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Sur/, expanded: false }))
    expect(screen.queryByText('Semana 41')).toBeNull()
    expect(screen.getByText('Semana 39')).toBeTruthy()
  })
  it('el clic en la barra abre cuánto se pasaron ESE cliente, sin la columna de cliente', () => {
    render(<ResultadosPorCliente informes={DATOS} soloFuera={false} />)
    fireEvent.click(screen.getByRole('button', { name: /^Dole: ver cuánto se pasaron/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getAllByRole('row')).toHaveLength(3) // encabezado + 2 resultados fuera de Dole
    expect(within(dialogo).queryByText('Cliente')).toBeNull()
    expect(within(dialogo).getByText('+1,00 ppm')).toBeTruthy()
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
