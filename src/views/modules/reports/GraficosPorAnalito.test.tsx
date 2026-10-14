import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Observacion } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'

// jsdom no dibuja canvas: se reemplaza Chart.js por un doble que no hace nada.
vi.mock('chart.js', () => ({ Chart: class { destroy() {} } }))

import { limitesDeEspecie } from '@/features/reportes'
import { GraficosPorAnalito } from './GraficosPorAnalito'

const p = (ingrediente: string, ppm: number) => ({ ingrediente, ppm }) as Observacion
const inf = (id: number, ...puntos: Observacion[]): InformeConPuntos => ({ solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos })
const colores = { borde: '#ddd', superficie: '#fff', texto: '#000', suave: '#777', peligro: '#b00' }

describe('GraficosPorAnalito', () => {
  const informes = [inf(1, p('FDL', 1), p('PYR', 2), p('IMZ', 2)), inf(2, p('FDL', 3.5), p('PYR', 0.5)), inf(3, p('PYR', 5))]

  it('hace un gráfico por analito y pone primero al que más resultados fuera de rango tiene', () => {
    render(<GraficosPorAnalito informes={informes} analitos={['FDL', 'IMZ', 'PYR']} limites={limitesDeEspecie('Clementina')} unidad="ppm" colores={colores} onAbrir={() => {}} />)
    const tarjetas = screen.getAllByRole('article')
    expect(tarjetas.map((t) => t.getAttribute('aria-label'))).toEqual(['Gráfico de PYR', 'Gráfico de FDL', 'Gráfico de IMZ'])
    expect(screen.getByText('2 de 3 fuera de rango')).toBeTruthy()
    expect(screen.getByText('1 de 2 fuera de rango')).toBeTruthy()
    expect(screen.getByText('1 dentro del rango')).toBeTruthy()
    expect(screen.getByText('Límite 0,70 – 3,00 ppm')).toBeTruthy()
  })

  it('un analito sin límite en la tabla se grafica igual y lo dice', () => {
    render(<GraficosPorAnalito informes={informes} analitos={['IMZ']} limites={limitesDeEspecie('Manzana')} unidad="ppm" colores={colores} onAbrir={() => {}} />)
    expect(screen.getByText('Sin límite en la tabla para esta especie')).toBeTruthy()
  })

  it('con un solo informe dibuja solo sus resultados: un gráfico por analito y «1 de 1»', () => {
    render(<GraficosPorAnalito informes={[informes[1]]} analitos={['FDL', 'PYR']} limites={limitesDeEspecie('Clementina')} unidad="ppm" colores={colores} onAbrir={() => {}} />)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getAllByText('1 de 1 fuera de rango')).toHaveLength(2) // FDL sobre y PYR bajo, cada uno con su único resultado
    expect(screen.queryByText(/de 3 fuera de rango/)).toBeNull()
  })
})
