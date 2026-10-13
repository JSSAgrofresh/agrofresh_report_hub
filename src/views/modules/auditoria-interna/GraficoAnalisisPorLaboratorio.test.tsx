import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GraficoAnalisisPorLaboratorio } from './Graficos'

describe('GraficoAnalisisPorLaboratorio', () => {
  it('un panel por laboratorio y análisis, con el contador de análisis de cada cliente', () => {
    render(
      <GraficoAnalisisPorLaboratorio
        nombre="Sold To"
        paneles={[
          { laboratorio: 'ALS', analisis: 'FSMA', total: 5, informes: 2, nGrupos: 3, filas: [{ grupo: 'DOLE', analisis: 4, informes: 2 }, { grupo: 'MULTI', analisis: 1, informes: 0 }] },
          { laboratorio: 'DIAGNOFRUIT', analisis: 'CUANTIFICACIÓN DE PATÓGENOS', total: 1, informes: 0, nGrupos: 1, filas: [{ grupo: 'DOLE', analisis: 1, informes: 0 }] },
        ]}
      />,
    )
    const als = within(screen.getByRole('region', { name: 'ALS: FSMA' }))
    expect(als.getByText('FSMA')).toBeTruthy()
    expect(als.getByText(/análisis pedidos/)).toBeTruthy()
    expect(als.getByText('4')).toBeTruthy()
    expect(als.getByRole('img', { name: 'DOLE: 2 de 4 con informe' })).toBeTruthy()
    expect(als.getByText('y 1 sold to más')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Diagnofruit: CUANTIFICACIÓN DE PATÓGENOS' })).toBeTruthy()
  })
})
