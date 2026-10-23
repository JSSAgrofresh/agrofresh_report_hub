import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EstiloPorCuenta } from './EstiloPorCuenta'

const temas = {
  tipos: { cliente: null, comercial: null },
  cuentas: [
    { id: '7', nombre: 'Ana Comercial', email: 'ana@agrofresh.com', tipo: 'comercial' as const, cliente: null, planta: null, tema: 'basico' as const, propio: false },
    { id: '8', nombre: 'Dole Lontué', email: 'dole@x.cl', tipo: 'cliente' as const, cliente: 'DOLE', planta: 'LONTUE', tema: 'sobrio' as const, propio: true },
  ],
  cambiado_por: null,
  cambiado_en: null,
}

describe('EstiloPorCuenta', () => {
  it('lista las cuentas y avisa cuál tiene estilo propio', () => {
    render(<EstiloPorCuenta temas={temas} predeterminado="basico" puedeCambiar onCambiar={vi.fn()} />)
    expect(screen.getByText('Ana Comercial')).toBeTruthy()
    expect(screen.getByText('Dole Lontué')).toBeTruthy()
  })

  it('el buscador filtra por nombre', () => {
    render(<EstiloPorCuenta temas={temas} predeterminado="basico" puedeCambiar onCambiar={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ana' } })
    expect(screen.queryByText('Dole Lontué')).toBeNull()
    expect(screen.getByText('Ana Comercial')).toBeTruthy()
  })
})
