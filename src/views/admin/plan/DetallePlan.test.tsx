import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FilaDetallePlan } from '@/features/planEntregables'

const api = vi.hoisted(() => ({ leerDetallePlanEntregables: vi.fn() }))
vi.mock('@/features/planEntregables', async (importar) => ({ ...(await importar<typeof import('@/features/planEntregables')>()), ...api }))

import { DetallePlan } from './DetallePlan'

const fila = (p: Partial<FilaDetallePlan>): FilaDetallePlan => ({
  sold_to: 'DOLE CHILE S.A.', sold_to_sap: '1606562', planta_plan: 'DOLE LONTUE', comercial: 'JC LABARCA', tipo_cliente: 'Estrategico',
  tipo_servicio: 'Costo por Litro', servicio: 'residuales', linea: 1, semana: 'W45', peak: 'Pre peack', original: 1, propuesta: 2, ...p,
})
const FILAS = [
  fila({}),
  fila({ semana: 'W46', original: null, propuesta: 3 }),
  fila({ sold_to: 'GRIN GROUP SPA', sold_to_sap: '10013494', planta_plan: 'GRIN', comercial: 'LUCIANO ALLENDE', servicio: 'fito', original: 4, propuesta: null }),
]

beforeEach(() => {
  vi.clearAllMocks()
  api.leerDetallePlanEntregables.mockResolvedValue({ temporada: '2026-27', filas: FILAS, cargado_en: null, migracion_pendiente: false, detalle_completo: true })
})

describe('DetallePlan', () => {
  it('muestra todas las filas con sus dos cantidades y los totales', async () => {
    render(<DetallePlan recargar={0} />)
    await screen.findByText('GRIN GROUP SPA')
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3)
    const totales = screen.getByLabelText('Totales de lo que se ve')
    expect(within(totales).getByText('Original (total)').previousSibling?.textContent).toBe('5')
    expect(within(totales).getByText('Propuesta (total)').previousSibling?.textContent).toBe('5')
    expect(screen.getByText('10013494')).toBeTruthy()
  })

  it('un dato vacío se ve como guion y no como cero', async () => {
    render(<DetallePlan recargar={0} />)
    await screen.findByText('GRIN GROUP SPA')
    const grin = screen.getByText('GRIN GROUP SPA').closest('tr') as HTMLElement
    expect(within(grin).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(grin).queryByText('0')).toBeNull()
  })

  it('el buscador y los filtros acotan la tabla y los totales', async () => {
    render(<DetallePlan recargar={0} />)
    await screen.findByText('GRIN GROUP SPA')
    fireEvent.change(screen.getByPlaceholderText(/Sold To, código SAP/), { target: { value: 'grin' } })
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    expect(screen.queryByText('DOLE CHILE S.A.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4))
  })

  it('sin la migración 0073 lo avisa', async () => {
    api.leerDetallePlanEntregables.mockResolvedValue({ temporada: '2026-27', filas: FILAS, cargado_en: null, migracion_pendiente: false, detalle_completo: false })
    render(<DetallePlan recargar={0} />)
    expect(await screen.findByText(/Falta correr la migración 0073/)).toBeTruthy()
  })

  it('sin plan cargado lo dice', async () => {
    api.leerDetallePlanEntregables.mockResolvedValue({ temporada: '2026-27', filas: [], cargado_en: null, migracion_pendiente: false, detalle_completo: true })
    render(<DetallePlan recargar={0} />)
    expect(await screen.findByText('Todavía no hay un plan cargado.')).toBeTruthy()
  })
})
