import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsuariosTable } from './UsuariosTable'
import type { Usuario } from '../types'

const cuentas: Usuario[] = [
  { id: '1', email: 'jorge.sandoval@agrofresh.com', nombre: 'Jorge Sandoval', tipoAcceso: 'admin_general' },
  { id: '2', email: 'prueba1@agrofresh.com', nombre: 'DOLE CODEGUA', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.', plantaNombre: 'DOLE PLANTA CODEGUA', modulos: ['reports', 'storage'], reportes: ['laboratorio'] },
  { id: '3', email: 'a@agrofresh.com', nombre: 'Ana', tipoAcceso: 'admin_area', area: 'cromatografia', modulos: ['converter', 'ingesta', 'trace', 'storage', 'agrofresh_lab'], reportes: [] },
]

describe('UsuariosTable', () => {
  it('muestra iniciales, tipo de cuenta, qué ve y el cliente', () => {
    render(<UsuariosTable usuarios={cuentas} onEditar={() => {}} onEliminar={() => {}} onRestablecer={() => {}} />)
    expect(screen.getByText('JS')).toBeTruthy()
    expect(screen.getByText('Todo el sistema')).toBeTruthy()
    expect(screen.getByText('Cliente · Report + Storage')).toBeTruthy()
    expect(screen.getByText(/DOLE CHILE S.A./)).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy() // Ana: 5 accesos, se ven 3
  })

  it('el maestro no se puede eliminar y las acciones llaman a su callback', () => {
    const onEditar = vi.fn()
    render(<UsuariosTable usuarios={cuentas} onEditar={onEditar} onEliminar={() => {}} onRestablecer={() => {}} />)
    expect((screen.getAllByRole('button', { name: 'Eliminar' })[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1])
    expect(onEditar).toHaveBeenCalledWith(cuentas[1])
  })

  it('con la lista vacía muestra el texto que se le pase', () => {
    render(<UsuariosTable usuarios={[]} vacio="Ningún usuario coincide con el filtro." onEditar={() => {}} onEliminar={() => {}} onRestablecer={() => {}} />)
    expect(screen.getByText('Ningún usuario coincide con el filtro.')).toBeTruthy()
  })
})
