import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PendientesIngesta } from './PendientesIngesta'
import type { Pendiente } from '@/features/ingest'

const { listarPendientes, descartarPendiente, descartarLotePendientes, reintentarPendientes } =
  vi.hoisted(() => ({
    listarPendientes: vi.fn(),
    descartarPendiente: vi.fn(),
    descartarLotePendientes: vi.fn(),
    reintentarPendientes: vi.fn(),
  }))

vi.mock('@/features/ingest', () => ({
  listarPendientes,
  descartarPendiente,
  descartarLotePendientes,
  reintentarPendientes,
}))

const PENDIENTE: Pendiente = {
  id: 7,
  origen: 'ingest',
  fila: {
    'N° Informe': 'INF-9',
    'Sold To': 'DOLE CHILE S.A.',
    'Ship To': 'AMS FAMILY S.A',
    Especie: 'Manzana',
  },
  motivos: [{ campo: 'ship_to_raw', etiqueta: 'Ship To (sucursal)', valor: 'AMS FAMILY S.A' }],
  creado_en: '2026-09-25T12:00:00Z',
}

const pagina = (filas: Pendiente[]) => ({ filas, total: filas.length, pagina: 1, tamano: 200 })

afterEach(() => vi.clearAllMocks())

describe('PendientesIngesta', () => {
  it('muestra las filas pendientes con su motivo, sin subir ningún archivo', async () => {
    listarPendientes.mockResolvedValue(pagina([PENDIENTE]))
    render(<PendientesIngesta />)
    expect(await screen.findByText('INF-9')).toBeInTheDocument()
    expect(
      screen.getByText('Ship To (sucursal) «AMS FAMILY S.A» no está en Listados'),
    ).toBeInTheDocument()
  })

  it('descartar todas pide confirmación y vuelve a leer', async () => {
    listarPendientes.mockResolvedValueOnce(pagina([PENDIENTE])).mockResolvedValueOnce(pagina([]))
    descartarLotePendientes.mockResolvedValue({ descartados: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PendientesIngesta />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar todas' }))
    await waitFor(() => expect(descartarLotePendientes).toHaveBeenCalledWith())
    expect(await screen.findByText('1 fila(s) descartadas.')).toBeInTheDocument()
    expect(screen.getByText(/No hay filas pendientes/)).toBeInTheDocument()
  })

  it('si no se confirma, no descarta nada', async () => {
    listarPendientes.mockResolvedValue(pagina([PENDIENTE]))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PendientesIngesta />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar todas' }))
    expect(descartarLotePendientes).not.toHaveBeenCalled()
  })

  it('descarta una sola fila', async () => {
    listarPendientes.mockResolvedValueOnce(pagina([PENDIENTE])).mockResolvedValueOnce(pagina([]))
    descartarPendiente.mockResolvedValue({ ok: true })
    render(<PendientesIngesta />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(descartarPendiente).toHaveBeenCalledWith(7))
  })

  it('reintentar dice cuántas entraron', async () => {
    listarPendientes.mockResolvedValueOnce(pagina([PENDIENTE])).mockResolvedValueOnce(pagina([]))
    reintentarPendientes.mockResolvedValue({ reintentados: 1, resueltos: 1, resumen: {} })
    render(<PendientesIngesta />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar todas' }))
    expect(await screen.findByText('1 fila(s) entraron a la base.')).toBeInTheDocument()
  })
})
