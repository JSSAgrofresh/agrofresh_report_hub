import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { AppLayout } from '../AppLayout'
import { VistaClienteLayout } from './VistaClienteLayout'

vi.mock('@/features/reportes/lib/api', () => ({
  obtenerVistaReport: () => Promise.resolve({ graficos_informes: false, tema_cliente: 'sobrio' }),
}))

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
    expect(screen.getByRole('link', { name: 'Análisis de Laboratorio' })).toHaveAttribute('href', '/modulos/reportes/laboratorio')
    expect(screen.getByRole('link', { name: 'Informes de Laboratorio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('contenido de la pantalla')).toBeInTheDocument()
    expect(document.querySelector('aside')).toBeNull()
  })

  it('con informes Accu-Tab el menú va en orden: análisis, informes y Reportes Accutab', () => {
    montar({ id: '3', nombre: 'Planta Lontué', email: 'c@dole.com', tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['reports', 'storage'], reportes: ['laboratorio', 'postventa'] })

    const nombres = within(screen.getByRole('navigation', { name: 'Secciones' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('aria-label') ?? a.textContent)
      .filter((t) => t && !t.startsWith('AgroFresh'))
    expect(nombres).toEqual(['Análisis de Laboratorio', 'Informes de Laboratorio', 'Reportes Accutab'])
    expect(screen.queryByRole('link', { name: 'Panel general' })).toBeNull()
  })

  it('el personal interno sigue con la barra lateral de siempre', () => {
    montar({ id: '1', nombre: 'Jorge Sandoval', email: 'j@agrofresh.com', tipoAcceso: 'admin_general' })

    expect(document.querySelector('aside')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
  })

  it('un cliente ve el estilo que quedó como predeterminado y no puede cambiarlo', async () => {
    montar({ id: '2', nombre: 'Planta Lontué', email: 'c@dole.com', tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['reports', 'storage'], reportes: ['laboratorio'] })

    await waitFor(() => expect(document.querySelector('[data-portal]')).toHaveAttribute('data-tema', 'sobrio'))
    expect(screen.queryByRole('group', { name: 'Estilo del dashboard' })).toBeNull()
  })

  it('en la Vista de cliente se puede alternar entre los estilos', async () => {
    const user = { id: '1', nombre: 'Jorge', email: 'j@agrofresh.com', tipoAcceso: 'admin_general' }
    const valor = { user, login: async () => {}, logout: async () => {}, refrescar: async () => {}, sincronizando: false }
    const router = createMemoryRouter([{ element: <VistaClienteLayout />, children: [{ path: '/', element: <p>x</p> }] }], { initialEntries: ['/'] })
    render(
      <AuthContext.Provider value={valor as never}>
        <RouterProvider router={router} />
      </AuthContext.Provider>,
    )
    await waitFor(() => expect(document.querySelector('[data-portal]')).toHaveAttribute('data-tema', 'sobrio'))
    const grupo = screen.getByRole('group', { name: 'Estilo del dashboard' })
    fireEvent.click(within(grupo).getByRole('button', { name: /Básico/ }))
    expect(document.querySelector('[data-portal]')).toHaveAttribute('data-tema', 'basico')
    fireEvent.click(within(grupo).getByRole('button', { name: /Sobrio/ }))
    expect(document.querySelector('[data-portal]')).toHaveAttribute('data-tema', 'sobrio')
  })
})
