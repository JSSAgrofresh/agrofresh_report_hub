import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemInventario } from '@/features/inventarioLab'

const api = vi.hoisted(() => ({
  listarInventario: vi.fn(), listarMovimientos: vi.fn(), buscarPorCodigo: vi.fn(), moverStock: vi.fn(),
  crearItem: vi.fn(), corregirItem: vi.fn(), siguienteCodigo: vi.fn(),
}))
vi.mock('@/features/inventarioLab', async (orig) => ({ ...(await orig<typeof import('@/features/inventarioLab')>()), ...api }))
vi.mock('../EscanerCamara', () => ({ EscanerCamara: () => null }))

import { cumpleFiltro } from '@/features/inventarioLab'
import { InventarioView } from './InventarioView'

const item = (p: Partial<ItemInventario>): ItemInventario => ({
  id: 1, codigo: 'INS-52', categoria: 'Estándar analítico', ubicacion: 'Laboratorio', descripcion: 'Difenilamina', detalle: null,
  almacenamiento: null, presentacion: '250mg', lote: 'BCCF1666', vencimiento: '2025-11-30', referencia: '45456', stock: 1,
  activo: true, actualizado: '', estado_vencimiento: 'vencido', dias_para_vencer: -30, ...p,
})
const A = item({ id: 1 })
const B = item({ id: 2, lote: 'BCCN1840', vencimiento: '2030-03-31', estado_vencimiento: 'vigente', dias_para_vencer: 1600 })

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.listarInventario.mockResolvedValue([A, B])
  api.listarMovimientos.mockResolvedValue([])
})

const abrir = () => render(<MemoryRouter><InventarioView /></MemoryRouter>)
async function escanear(codigo: string) {
  const campo = await screen.findByLabelText('Código del producto')
  fireEvent.change(campo, { target: { value: codigo } })
  fireEvent.submit(campo.closest('form')!)
}

describe('alertas: un frasco vencido sin stock no cuenta', () => {
  it('cumpleFiltro', () => {
    expect(cumpleFiltro(A, 'vencido')).toBe(true)
    expect(cumpleFiltro({ ...A, stock: 0 }, 'vencido')).toBe(false)
    expect(cumpleFiltro({ ...A, stock: 0 }, 'sin_stock')).toBe(true)
    expect(cumpleFiltro(B, 'vencido')).toBe(false)
  })
})

describe('Inventario: escaneo y movimientos', () => {
  it('un código compartido muestra una tarjeta por cada producto', async () => {
    api.buscarPorCodigo.mockResolvedValue([A, B])
    abrir()
    await escanear('ins-52')
    expect(api.buscarPorCodigo).toHaveBeenCalledWith('INS-52')
    expect(await screen.findByText('2 productos')).toBeTruthy()
    expect(screen.getByText('BCCF1666', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText('BCCN1840', { selector: 'dd' })).toBeTruthy()
  })

  it('«−» registra una salida y vuelve a pedir el stock guardado', async () => {
    api.buscarPorCodigo.mockResolvedValueOnce([A]).mockResolvedValue([{ ...A, stock: 0 }])
    api.moverStock.mockResolvedValue({ ...A, stock: 0 })
    abrir()
    await escanear('INS-52')
    fireEvent.click(await screen.findByLabelText('Sacar de INS-52'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }))
    await waitFor(() => expect(api.moverStock).toHaveBeenCalledWith(1, 'salida', 1, ''))
    await waitFor(() => expect((screen.getByLabelText('Sacar de INS-52') as HTMLButtonElement).disabled).toBe(true))
  })

  it('si el servidor rechaza la salida, lo dice en la tarjeta', async () => {
    api.buscarPorCodigo.mockResolvedValue([A])
    api.moverStock.mockRejectedValue(new Error('x'))
    abrir()
    await escanear('INS-52')
    fireEvent.click(await screen.findByLabelText('Sacar de INS-52'))
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/movimiento/i)
  })

  it('un código que no existe ofrece crearlo con ese código', async () => {
    api.buscarPorCodigo.mockResolvedValue([])
    abrir()
    await escanear('INS-99')
    fireEvent.click(await screen.findByRole('button', { name: 'Crear INS-99' }))
    expect((screen.getByPlaceholderText('INS-57') as HTMLInputElement).value).toBe('INS-99')
  })
})
