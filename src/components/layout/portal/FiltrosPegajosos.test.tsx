import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FiltrosPegajosos } from './FiltrosPegajosos'
import { PortalContext } from './PortalContext'

describe('FiltrosPegajosos', () => {
  it('fuera del portal es la sección de filtros de siempre, sin marcas ni botón', () => {
    render(<FiltrosPegajosos className="x"><p>controles</p></FiltrosPegajosos>)

    const seccion = screen.getByRole('region', { name: 'Filtros' })
    expect(seccion).not.toHaveAttribute('data-pegado')
    expect(screen.queryByRole('button', { name: /filtros/i })).toBeNull()
    expect(screen.getByText('controles')).toBeInTheDocument()
  })

  it('dentro del portal arranca suelta (sin pegar) y plegada, con su botón para mostrar los controles', () => {
    render(
      <PortalContext.Provider value={true}>
        <FiltrosPegajosos className="x"><p>controles</p></FiltrosPegajosos>
      </PortalContext.Provider>,
    )

    expect(screen.getByRole('region', { name: 'Filtros' })).toHaveAttribute('data-pegado', 'false')
    expect(screen.getByRole('region', { name: 'Filtros' })).toHaveAttribute('data-abierto', 'false')
    expect(screen.getByRole('button', { name: /mostrar filtros/i })).toBeInTheDocument()
    expect(screen.getByText('controles')).toBeInTheDocument()
  })
})
