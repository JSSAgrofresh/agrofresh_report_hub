import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraficoGrupoLaboratorio } from './Graficos'

describe('GraficoGrupoLaboratorio', () => {
  it('una tarjeta por grupo, con solo los laboratorios que tuvieron análisis', () => {
    render(
      <GraficoGrupoLaboratorio
        grupos={[{ grupo: 'DOLE CHILE S.A.', total: 5, labs: { QUITECA: { analisis: 4, informes: 3 }, ALS: { analisis: 1, informes: 0 } } }]}
      />,
    )
    expect(screen.getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(screen.getByText('3 de 5 con informe')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Quiteca: 3 de 4 informes concretados \(75%\)/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /ALS: 0 de 1/ })).toBeTruthy()
    expect(screen.queryByText('Diagnofruit')).toBeNull()
  })
})
