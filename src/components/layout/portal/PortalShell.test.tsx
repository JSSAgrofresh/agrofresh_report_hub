import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { AppLayout } from '../AppLayout'

function montar(user: Record<string, unknown>) {
  const valor = { user, login: async () => {}, logout: async () => {}, refrescar: async () => {}, sincronizando: false }
  const router = createMemoryRouter([{ element: <AppLayout />, children: [{ path: '/', element: <p>contenido de la pantalla</p> }] }], {
    initialEntries: ['/'],
  })
  return render(
    <AuthContext.Provider value={valor as never}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
}

describe('AppLayout según el tipo de cuenta', () => {
  it('un cliente ve la burbuja con el logo y sus accesos, sin barra lateral, y su pantalla igual', () => {
    montar({ id: '2', nombre: 'Planta Lontué', email: 'c@dole.com', tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['reports', 'storage'], reportes: ['laboratorio'] })

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
    expect(screen.getByAltText('AgroFresh')).toBeInTheDocument()
    // Lo primero que ve es el Report: el Panel general queda fuera del menú y Report abre directo en los gráficos.
    expect(screen.queryByRole('link', { name: 'Panel general' })).toBeNull()
    expect(screen.getByRole('link', { name: /Report/i })).toHaveAttribute('href', '/modulos/reportes/laboratorio')
    expect(screen.getByRole('link', { name: /Storage/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('contenido de la pantalla')).toBeInTheDocument()
    expect(document.querySelector('aside')).toBeNull()
  })

  it('el personal interno sigue con la barra lateral de siempre', () => {
    montar({ id: '1', nombre: 'Jorge Sandoval', email: 'j@agrofresh.com', tipoAcceso: 'admin_general' })

    expect(document.querySelector('aside')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
  })
})
