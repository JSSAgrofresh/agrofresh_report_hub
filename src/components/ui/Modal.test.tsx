import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Modal } from './Modal'

describe('Modal', () => {
  it('se dibuja en el body, no dentro de quien lo abre', () => {
    // Una fila animada (con transform) atrapaba el `position: fixed` y el
    // diálogo de Eliminar salía recortado dentro de la fila.
    render(
      <div data-testid="fila" style={{ transform: 'translateY(0)' }}>
        <Modal titulo="Eliminar" onCerrar={() => {}}>contenido</Modal>
      </div>,
    )
    const dialogo = screen.getByRole('dialog')
    expect(screen.getByTestId('fila').contains(dialogo)).toBe(false)
    expect(document.body.contains(dialogo)).toBe(true)
  })
})
