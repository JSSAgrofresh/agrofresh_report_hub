import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Usuario } from '@/features/usuarios'

const sesion = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))

import { AgrofreshLabHubView } from './AgrofreshLabHubView'

const cuenta = (modulos?: string[]): Usuario => ({
  id: '1', email: 'a@agrofresh.com', nombre: 'A', tipoAcceso: 'admin_area', area: 'cromatografia', modulos,
})

function pintar(user: Usuario) {
  sesion.user = user
  render(<MemoryRouter><AgrofreshLabHubView /></MemoryRouter>)
}

describe('hub de AgroFresh Lab: cada cuenta ve solo sus secciones', () => {
  it('sin secciones elegidas muestra las tres', () => {
    pintar(cuenta(['agrofresh_lab']))
    expect(screen.getByText('Ingreso al laboratorio')).toBeTruthy()
    expect(screen.getByText('Verificaciones diarias')).toBeTruthy()
    expect(screen.getByText('Envío de informes')).toBeTruthy()
  })

  it('a quien se le ocultó «Verificaciones diarias» no le sale', () => {
    pintar(cuenta(['agrofresh_lab', 'lab_ingreso', 'lab_envio']))
    expect(screen.getByText('Ingreso al laboratorio')).toBeTruthy()
    expect(screen.getByText('Envío de informes')).toBeTruthy()
    expect(screen.queryByText('Verificaciones diarias')).toBeNull()
  })
})
