import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Usuario } from '@/features/usuarios'

const cuentas: Usuario[] = [
  { id: '1', email: 'jorge.sandoval@agrofresh.com', nombre: 'Jorge Sandoval', tipoAcceso: 'admin_general' },
  { id: '2', email: 'diego@gmail.com', nombre: 'Diego Inostroza', tipoAcceso: 'muestreador' },
  { id: '3', email: 'fran@gmail.com', nombre: 'Francisca Donoso', tipoAcceso: 'muestreador' },
  { id: '4', email: 'prueba1@agrofresh.com', nombre: 'DOLE CODEGUA', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.', modulos: ['reports'], reportes: ['laboratorio'] },
]

vi.mock('@/features/usuarios/hooks/useUsuarios', () => ({
  useUsuarios: () => ({ usuarios: cuentas, cargando: false, crear: vi.fn(), actualizar: vi.fn(), eliminar: vi.fn() }),
}))
vi.mock('@/features/catalogo', () => ({ listarClientes: vi.fn().mockResolvedValue([]), listarPlantas: vi.fn().mockResolvedValue([]) }))

import { UsuariosView } from './UsuariosView'

const filas = () => screen.getAllByRole('row').slice(1)

describe('UsuariosView: filtros', () => {
  it('parte con todos y cada botón muestra cuántas cuentas hay', () => {
    render(<UsuariosView />)
    expect(filas()).toHaveLength(4)
    const grupo = screen.getByRole('group', { name: 'Filtrar por tipo de cuenta' })
    expect(within(grupo).getByRole('button', { name: /Muestreadores/ }).textContent).toContain('2')
    expect((within(grupo).getByRole('button', { name: /Analistas/ }) as HTMLButtonElement).disabled).toBe(true) // 0 cuentas
  })

  it('filtrar por Muestreadores y por Clientes deja solo esas cuentas', () => {
    render(<UsuariosView />)
    fireEvent.click(screen.getByRole('button', { name: /Muestreadores/ }))
    expect(filas()).toHaveLength(2)
    expect(screen.getByText('2 de 4 usuarios')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clientes/ }))
    expect(filas()).toHaveLength(1)
    expect(screen.getByText('DOLE CODEGUA')).toBeTruthy()
  })

  it('el buscador se combina con el tipo y «Quitar filtros» lo limpia todo', () => {
    render(<UsuariosView />)
    fireEvent.click(screen.getByRole('button', { name: /Muestreadores/ }))
    fireEvent.change(screen.getByLabelText('Buscar usuarios'), { target: { value: 'fran' } })
    expect(filas()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Buscar usuarios'), { target: { value: 'zzz' } })
    expect(screen.getByText('Ningún usuario coincide con el filtro.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(filas()).toHaveLength(4)
  })
})
