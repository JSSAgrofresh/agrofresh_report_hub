import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IngestaInicio } from './IngestaInicio'
import { bandeja, INFORME_ROJO, PANEL } from './fixturesIngreso'

const { useAuth, panelIngreso, ultimoSondeo, listarBandeja } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  panelIngreso: vi.fn(),
  ultimoSondeo: vi.fn(),
  listarBandeja: vi.fn(),
}))

vi.mock('@/features/auth', () => ({ useAuth }))
vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, panelIngreso, ultimoSondeo, listarBandeja }
})
vi.mock('@/features/ingest', () => ({
  listarCargas: vi.fn().mockResolvedValue({ disponible: true, cargas: [] }),
  deshacerCarga: vi.fn(),
  listarPendientes: vi.fn().mockResolvedValue({ filas: [], total: 0, pagina: 1, tamano: 50 }),
}))
vi.mock('chart.js', () => {
  class FakeChart {
    static register() {}
    destroy() {}
  }
  return { Chart: FakeChart, CategoryScale: {}, LinearScale: {}, LineController: {}, LineElement: {}, PointElement: {}, Tooltip: {}, Legend: {}, Filler: {} }
})

const PRINCIPAL = { id: '1', email: 'jorge.sandoval@agrofresh.com', nombre: 'Jorge', tipoAcceso: 'admin_general' }
const OTRO_ADMIN = { id: '2', email: 'otra@agrofresh.com', nombre: 'Otra', tipoAcceso: 'admin_general' }

function pantalla() {
  return render(
    <MemoryRouter>
      <IngestaInicio cargando={false} error={null} onArchivo={() => {}} />
    </MemoryRouter>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('IngestaInicio (Ingreso de informes)', () => {
  it('el administrador principal ve el panel: cifras, informes del correo, solicitudes y la carga manual', async () => {
    useAuth.mockReturnValue({ user: PRINCIPAL })
    panelIngreso.mockResolvedValue(PANEL)
    ultimoSondeo.mockResolvedValue(bandeja([]).ultimo_sondeo)
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    pantalla()

    expect(screen.getByRole('heading', { name: 'Informes de laboratorio' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /Tablero/ })).toHaveAttribute('aria-selected', 'true')
    // Todo está en el mismo tablero: la demora, lo que falta por llegar y los envíos por revisar.
    expect(await screen.findByText('Demora de los informes')).toBeInTheDocument()
    expect(screen.getByText('Faltan por llegar')).toBeInTheDocument()
    expect(await screen.findByText('Revisión de envíos')).toBeInTheDocument()

    // El filtro por laboratorio vuelve a pedir el panel solo con ese laboratorio.
    fireEvent.click(screen.getByRole('button', { name: 'Quiteca' }))
    await waitFor(() => expect(panelIngreso).toHaveBeenLastCalledWith(60, ['Quiteca']))

    fireEvent.click(screen.getByRole('tab', { name: 'Todos los informes' }))
    await waitFor(() => expect(listarBandeja).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('tab', { name: 'Carga manual' }))
    expect(await screen.findByText('Excel de resultados')).toBeInTheDocument()
  })

  it('las pestañas muestran cuántos informes esperan una decisión y cuántas solicitudes faltan', async () => {
    useAuth.mockReturnValue({ user: PRINCIPAL })
    panelIngreso.mockResolvedValue(PANEL)
    ultimoSondeo.mockResolvedValue(null)
    listarBandeja.mockResolvedValue(bandeja([]))
    pantalla()
    const informes = await screen.findByRole('tab', { name: /Tablero/ })
    await waitFor(() => expect(informes).toHaveTextContent('4'))
  })

  it('cualquier otra cuenta ve solo la carga manual de siempre', () => {
    useAuth.mockReturnValue({ user: OTRO_ADMIN })
    pantalla()
    expect(screen.getByRole('heading', { name: 'Carga de resultados' })).toBeInTheDocument()
    expect(screen.getByText('Excel de resultados')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(panelIngreso).not.toHaveBeenCalled()
  })
})
