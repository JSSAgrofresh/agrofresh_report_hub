import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NuevaSolicitudView } from './NuevaSolicitudView'
import type { CampoConfig } from '@/features/tomaMuestras'

/**
 * El Sold To / Ship To sale del listado del tipo de servicio: Actimist usa el
 * suyo, Línea de proceso el de siempre. Nunca se mezclan.
 */
const { listarClientes, listarPlantas, destinatariosParaLaboratorio } = vi.hoisted(() => ({
  listarClientes: vi.fn(),
  listarPlantas: vi.fn(),
  destinatariosParaLaboratorio: vi.fn(),
}))

vi.mock('@/features/tomaMuestras', async () => {
  const { enviaSoloSegunTipo } = await import('@/features/tomaMuestras/lib/envioAutomatico')
  const CAMPOS: CampoConfig[] = [
    { clave: 'sold_to', etiqueta: 'Sold To', tipo: 'select', requerido: true, activo: true, orden: 1 },
    { clave: 'ship_to', etiqueta: 'Ship To', tipo: 'select', requerido: false, activo: true, orden: 2 },
  ]
  return {
    crearSolicitud: vi.fn(),
    actualizarSolicitud: vi.fn(),
    obtenerSolicitud: vi.fn(),
    crearSolicitudPrueba: vi.fn(),
    crearSolicitudReanalisis: vi.fn(),
    enviarSolicitudPorCorreo: vi.fn(),
    listarAnalitosConfig: vi.fn().mockResolvedValue([]),
    listarCamposConfig: vi.fn().mockResolvedValue(CAMPOS),
    listarCamposTipoAplicacion: vi.fn().mockResolvedValue([]),
    listarLaboratoriosConfig: vi.fn().mockResolvedValue([
      { id: 1, codigo: 'QUITECA', nombre: 'Quiteca', descripcion: null, activo: true, orden: 1 },
    ]),
    listarProductosConfig: vi.fn().mockResolvedValue([]),
    listarTiposAplicacion: vi.fn().mockResolvedValue([
      { id: 1, nombre: 'Línea de proceso', activo: true, orden: 1 },
      { id: 2, nombre: 'Actimist', activo: true, orden: 2 },
    ]),
    obtenerEnvioAutomatico: vi.fn().mockResolvedValue({ activo: false }),
    enviaSoloSegunTipo,
    destinatariosParaLaboratorio,
    resultadosDeShipTo: vi.fn().mockResolvedValue([]),
  }
})
vi.mock('@/features/catalogo', async () => {
  const { mensajeCatalogo } = await import('@/features/catalogo/hooks/useCatalogo')
  return { listarClientes, listarPlantas, mensajeCatalogo }
})
vi.mock('@/features/laboratorios', () => ({
  listarAnalisis: vi.fn().mockResolvedValue([]),
  listarUnidades: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/listados', () => ({
  listarEspeciesActivas: vi.fn().mockResolvedValue([]),
  listarVariedadesActivasDeEspecie: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { nombre: 'Juan', email: 'juan@example.com' } }),
}))

const cliente = (id: number, nombre: string) => ({ id, nombre, codigo_sap: null, rut: null, activo: true, total_plantas: 1 })
const planta = (id: number, clienteNombre: string, nombre: string) => ({
  id, cliente_id: id, cliente_nombre: clienteNombre, nombre, codigo_sap: null, ciudad: null, activo: true,
})

function renderizar() {
  render(
    <MemoryRouter initialEntries={['/nueva']}>
      <Routes>
        <Route path="/nueva" element={<NuevaSolicitudView />} />
      </Routes>
    </MemoryRouter>,
  )
}

function opcionesSoldTo() {
  const input = screen.getByPlaceholderText(/elegir cliente/)
  fireEvent.focus(input)
  return input
}

beforeEach(() => {
  vi.clearAllMocks()
  destinatariosParaLaboratorio.mockResolvedValue({ destinatarios: [] })
  listarClientes.mockImplementation((servicio?: string) =>
    Promise.resolve(servicio === 'actimist' ? [cliente(9, 'EXPORTADORA ACTIMIST SA')] : [cliente(1, 'DOLE CHILE')]),
  )
  listarPlantas.mockImplementation((servicio?: string) =>
    Promise.resolve(
      servicio === 'actimist' ? [planta(9, 'EXPORTADORA ACTIMIST SA', 'FRIGORIFICO ACTIMIST')] : [planta(1, 'DOLE CHILE', 'PLANTA LONTUE')],
    ),
  )
})

describe('Sold To según el tipo de servicio', () => {
  it('pide primero el Tipo de Aplicación', async () => {
    renderizar()
    await waitFor(() => expect(screen.getByPlaceholderText(/elige primero el Tipo de Aplicación/)).toBeTruthy())
    expect((screen.getByPlaceholderText(/elige primero el Tipo de Aplicación/) as HTMLInputElement).disabled).toBe(true)
  })

  it('Línea de proceso usa el listado de siempre', async () => {
    renderizar()
    await waitFor(() => expect(screen.getByText('Quiteca')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Línea de proceso' } })
    opcionesSoldTo()
    expect(await screen.findByText('DOLE CHILE')).toBeTruthy()
    expect(screen.queryByText('EXPORTADORA ACTIMIST SA')).toBeNull()
    expect(screen.queryByText('Clientes de su listado')).toBeNull()
  })

  it('Actimist usa SU listado, y el Ship To sale de sus plantas', async () => {
    renderizar()
    await waitFor(() => expect(screen.getByText('Quiteca')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Actimist' } })
    expect(await screen.findByText('Clientes de su listado')).toBeTruthy()
    opcionesSoldTo()
    fireEvent.click(await screen.findByText('EXPORTADORA ACTIMIST SA'))
    expect(screen.queryByText('DOLE CHILE')).toBeNull()

    fireEvent.focus(screen.getByPlaceholderText(/sin sucursal específica/))
    expect(await screen.findByText('FRIGORIFICO ACTIMIST')).toBeTruthy()
    expect(screen.queryByText('PLANTA LONTUE')).toBeNull()
  })

  it('al cambiar de servicio se vacía el Sold To elegido', async () => {
    renderizar()
    await waitFor(() => expect(screen.getByText('Quiteca')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Actimist' } })
    opcionesSoldTo()
    fireEvent.click(await screen.findByText('EXPORTADORA ACTIMIST SA'))
    expect(screen.getByDisplayValue('EXPORTADORA ACTIMIST SA')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Línea de proceso' } })
    expect(screen.queryByDisplayValue('EXPORTADORA ACTIMIST SA')).toBeNull()
  })

  it('los destinatarios se piden con el Tipo de Aplicación', async () => {
    renderizar()
    await waitFor(() => expect(screen.getByText('Quiteca')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Laboratorio/), { target: { value: 'QUITECA' } })
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Actimist' } })
    await waitFor(() =>
      expect(destinatariosParaLaboratorio).toHaveBeenLastCalledWith(
        'QUITECA', expect.objectContaining({ tipo_aplicacion: 'Actimist' }),
      ),
    )
  })

  it('si el servidor no tiene el listado de Actimist, avisa sin romper Línea de proceso', async () => {
    const { HttpError } = await import('@/services/http/client')
    listarClientes.mockImplementation((servicio?: string) =>
      servicio === 'actimist' ? Promise.reject(new HttpError(404, 'Not Found')) : Promise.resolve([cliente(1, 'DOLE CHILE')]),
    )
    renderizar()
    await waitFor(() => expect(screen.getByText('Quiteca')).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Actimist' } })
    expect(await screen.findByText(/falta actualizar y reiniciar el backend/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Tipo de Aplicación/), { target: { value: 'Línea de proceso' } })
    opcionesSoldTo()
    expect(await screen.findByText('DOLE CHILE')).toBeTruthy()
  })
})
