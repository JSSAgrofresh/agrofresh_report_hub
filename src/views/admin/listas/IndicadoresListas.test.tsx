import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IndicadoresListas } from './IndicadoresListas'
import type { Indicadores } from '@/features/listasDistribucion'

const ind: Indicadores = {
  plantas: 195, conCliente: 169, conComercial: 195, conTecnico: 195, conAdmin: 195,
  alertas: { sin_tecnico: 0, sin_comercial: 0, sin_cliente: 26, fuera_listados: 0, copia_mal: 0, sin_lista_listados: 22 },
}

describe('IndicadoresListas', () => {
  it('cada recuadro explica qué cuenta en un globito accesible', () => {
    render(<IndicadoresListas ind={ind} resumen={{ plantas_con_lista: 195, plantas_listados: 217, listados_sin_lista: 22 }} filtro="todas" onFiltro={() => {}} />)
    const tiles = screen.getAllByRole('group')
    expect(tiles).toHaveLength(5)
    for (const t of tiles) expect(t).toHaveAttribute('aria-describedby')
    expect(screen.getAllByRole('tooltip', { hidden: true })).toHaveLength(5)
    expect(screen.getByText(/al menos un correo del cliente en alguna especie/)).toBeInTheDocument()
    expect(screen.getByText(/Jorge, Claudia y el correo del sistema/)).toBeInTheDocument()
  })
})
