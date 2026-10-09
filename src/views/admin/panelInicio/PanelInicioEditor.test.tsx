import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  leerDisenos: vi.fn(),
  guardarDiseno: vi.fn(),
  restaurarDiseno: vi.fn(),
}))
vi.mock('@/features/panelInicio/api/panelInicioApi', () => ({
  leerMiDiseno: vi.fn(),
  leerDisenos: api.leerDisenos,
  guardarDiseno: api.guardarDiseno,
  restaurarDiseno: api.restaurarDiseno,
}))
vi.mock('@/features/usuarios', async (original) => ({
  ...(await original<typeof import('@/features/usuarios')>()),
  useUsuarios: () => ({
    usuarios: [
      { id: '5', nombre: 'Cliente Dole', email: 'c@dole.com', tipoAcceso: 'cliente', area: 'cromatografia' },
      { id: '6', nombre: 'Ana Admin', email: 'a@agrofresh.com', tipoAcceso: 'admin_area', area: 'toma_muestras' },
    ],
  }),
}))

import { PanelInicioEditor } from './PanelInicioEditor'

beforeEach(() => {
  api.leerDisenos.mockResolvedValue({ disenos: {} })
  api.guardarDiseno.mockImplementation(async (clave: string, piezas: unknown[]) => ({ clave, piezas }))
  api.restaurarDiseno.mockResolvedValue({ clave: 'x' })
})

async function abrir() {
  render(<PanelInicioEditor />)
  await screen.findByText(/Este panel está vacío/)
}

describe('editor del Panel de inicio', () => {
  it('Añadir pone el widget en el primer hueco y Guardar manda el diseño', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Solicitudes en la base' }))
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Ingresadas esta semana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.guardarDiseno).toHaveBeenCalled())
    const [clave, piezas] = api.guardarDiseno.mock.calls[0]
    expect(clave).toBe('tipo:admin_general')
    expect(piezas).toEqual([
      { id: 'kpi:solicitudes', x: 0, y: 0, w: 3, h: 2 },
      { id: 'kpi:semana', x: 3, y: 0, w: 3, h: 2 },
    ])
  })

  it('un widget ya puesto no se puede poner dos veces', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Storage' }))
    expect((screen.getByRole('button', { name: 'Añadir Storage' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cuando no hay espacio avisa, en vez de ponerlo donde no cabe', async () => {
    await abrir()
    // Un reporte de 12×12 no entra si ya hay un panel que ocupa todo el ancho: se llena el tablero a propósito.
    fireEvent.click(screen.getByRole('button', { name: 'Empezar con el panel de siempre' }))
    const lleno = screen.getAllByRole('group')
    expect(lleno.length).toBeGreaterThan(10)
    // Se achica para probar que el aviso nombra el widget: el pedido de tamaño que pisa a otro se rechaza.
    fireEvent.click(screen.getByRole('group', { name: /Solicitudes en la base, 3 por 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Más ancho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Más ancho' }))
    expect(screen.getByRole('alert').textContent).toMatch(/no puede ser de .*se pisa con «/)
  })

  it('con el teclado: las flechas mueven y Suprimir quita', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Storage' }))
    const pieza = screen.getByRole('group', { name: /Storage, 3 por 3/ })
    fireEvent.keyDown(pieza, { key: 'ArrowRight' })
    expect(screen.getByRole('group', { name: /Storage, 3 por 3/ })).toBeTruthy()
    fireEvent.keyDown(pieza, { key: 'Delete' })
    expect(screen.queryByRole('group', { name: /Storage/ })).toBeNull()
  })

  it('a los clientes solo se les ofrecen widgets de cliente', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Todos los clientes' }))
    expect(screen.getByRole('button', { name: 'Añadir Reporte de residuos' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Añadir Storage' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Añadir Usuarios activos' })).toBeNull()
  })

  it('cambiar de objetivo con cambios sin guardar pregunta antes', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Storage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gerencia' }))
    expect(screen.getByRole('alert').textContent).toMatch(/cambios sin guardar/)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y cambiar' }))
    expect(await screen.findByText(/Este panel está vacío/)).toBeTruthy()
  })

  it('dejar el panel vacío y guardar lo restaura al de siempre', async () => {
    api.leerDisenos.mockResolvedValue({ disenos: { 'tipo:admin_general': { piezas: [{ id: 'modulo:storage', x: 0, y: 0, w: 3, h: 3 }] } } })
    render(<PanelInicioEditor />)
    await screen.findByRole('group', { name: /Storage/ })
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Storage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.restaurarDiseno).toHaveBeenCalledWith('tipo:admin_general'))
  })
})
