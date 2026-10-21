import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Usuario } from '@/features/usuarios'
import { MenuUsuario } from './MenuUsuario'

const cliente = { id: '2', nombre: 'Planta Lontué', email: 'c@dole.com', tipoAcceso: 'cliente', area: 'cromatografia', clienteNombre: 'DOLE CHILE S.A.', plantaNombre: 'DOLE LONTUE' } as Usuario

function montar(user: Usuario, vistaPrevia = false) {
  return render(
    <MemoryRouter>
      <MenuUsuario user={user} vistaPrevia={vistaPrevia} onSalir={() => {}} />
    </MemoryRouter>,
  )
}

describe('MenuUsuario', () => {
  it('al tocar el avatar muestra el Sold To y el Ship To de la cuenta', () => {
    montar(cliente)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Planta Lontué/ }))

    expect(screen.getByRole('dialog', { name: 'Datos de la cuenta' })).toBeInTheDocument()
    expect(screen.getByText('DOLE CHILE S.A.')).toBeInTheDocument()
    expect(screen.getByText('DOLE LONTUE')).toBeInTheDocument()
  })

  it('un comercial ve la lista de sus plantas', () => {
    montar({ ...cliente, tipoAcceso: 'comercial', plantasAsignadas: [{ clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' }, { clienteNombre: 'VERFRUT' }] })
    fireEvent.click(screen.getByRole('button', { name: /Planta Lontué/ }))

    expect(screen.getByText('DOLE LONTUE')).toBeInTheDocument()
    expect(screen.getByText('Todas las sucursales')).toBeInTheDocument()
  })

  it('en la vista previa del administrador ofrece volver a la vista normal', () => {
    montar({ ...cliente, tipoAcceso: 'admin_general' }, true)
    fireEvent.click(screen.getByRole('button', { name: /Planta Lontué/ }))

    expect(screen.getByRole('link', { name: 'Volver a la vista normal' })).toHaveAttribute('href', '/')
  })

  it('Escape lo cierra', () => {
    montar(cliente)
    fireEvent.click(screen.getByRole('button', { name: /Planta Lontué/ }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
