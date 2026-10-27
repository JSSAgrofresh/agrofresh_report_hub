import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activarSimulacion, desactivarSimulacion } from '@/features/simulacion'
import type { CargaTrace, ResumenCargaTrace } from '@/features/postventa'

const resumen = (carpeta: string, planta: string, ph: number): ResumenCargaTrace => ({
  carpeta,
  guardado_en: null,
  cliente: 'DOLE',
  planta,
  ubicacion: 'Línea 2',
  equipo: 'EQUIPO_1',
  responsable: null,
  n_registros: 100,
  ph_promedio: ph,
  mv_promedio: 650,
  tiene_pdf: true,
  n_archivos: 0,
  origen: 'email',
})

const LISTA = [resumen('2026-10-02_10-00-00', 'DOLE LONTUE', 7.1), resumen('2026-10-01_10-00-00', 'DOLE MOLINA', 6.9)]
const verInforme = vi.fn()

vi.mock('@/features/postventa', async (original) => ({
  ...(await original<typeof import('@/features/postventa')>()),
  listarInformesCliente: () => Promise.resolve(LISTA),
  verInformeCliente: (c: string) => verInforme(c),
  verPdfCliente: vi.fn(),
  descargarPdfCliente: vi.fn(),
}))
const sesion = { user: { tipoAcceso: 'cliente' } }
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))
vi.mock('./GraficoMedicion', () => ({ GraficoMedicion: ({ titulo }: { titulo: string }) => <div>grafico {titulo}</div> }))

import { InformesAccutabCliente } from './InformesAccutabCliente'

beforeEach(() => {
  desactivarSimulacion()
  sesion.user = { tipoAcceso: 'cliente' }
  verInforme.mockReset()
  verInforme.mockImplementation((carpeta: string) =>
    Promise.resolve({
      ...LISTA.find((r) => r.carpeta === carpeta)!,
      archivos: [],
      limites: null,
      estadisticas: { n: 1, ph: { min: 7, max: 7, prom: 7, desv: 0, rMin: null, rMax: null }, mv: { min: 650, max: 650, prom: 650, desv: 0, rMin: null, rMax: null } },
      filas: [{ ts: 1, fecha: '2026-10-02', hora: '10:00:00', modo: null, ph: 7, mv: 650, temp: 20, archivo: 'a.csv', desfase: 0 }],
    } satisfies CargaTrace),
  )
})

describe('InformesAccutabCliente', () => {
  it('muestra indicadores, el detalle del primer informe con sus gráficos de pH y ORP y su tabla', async () => {
    render(<InformesAccutabCliente />)
    expect(await screen.findByText('grafico pH')).toBeInTheDocument()
    expect(screen.getByText('grafico ORP')).toBeInTheDocument()
    expect(screen.getByText('Mediciones', { selector: 'span' })).toBeInTheDocument()
    expect(verInforme).toHaveBeenCalledWith('2026-10-02_10-00-00')
    expect(screen.getByRole('button', { name: 'Ver informe' })).toBeInTheDocument()
  })

  it('al elegir otro informe pide sus mediciones y el filtro Ship To acota la lista', async () => {
    render(<InformesAccutabCliente />)
    await screen.findByText('grafico pH')
    fireEvent.click(screen.getByRole('button', { name: /01-10-2026 10:00/ }))
    await waitFor(() => expect(verInforme).toHaveBeenCalledWith('2026-10-01_10-00-00'))
    fireEvent.change(screen.getByLabelText('Ship To'), { target: { value: 'DOLE LONTUE' } })
    expect(screen.queryByRole('button', { name: /01-10-2026 10:00/ })).not.toBeInTheDocument()
  })

  it('con la simulación prendida el administrador ve 30 informes simulados sin pedirlos al servidor ni PDF; un cliente nunca', async () => {
    activarSimulacion()
    sesion.user = { tipoAcceso: 'cliente' }
    const { unmount } = render(<InformesAccutabCliente />)
    expect(await screen.findByText('grafico pH')).toBeInTheDocument()
    expect(screen.queryByText(/Informes simulados/)).not.toBeInTheDocument()
    expect(verInforme).toHaveBeenCalledWith('2026-10-02_10-00-00')
    unmount()

    verInforme.mockClear()
    sesion.user = { tipoAcceso: 'admin_general' }
    render(<InformesAccutabCliente />)
    expect(await screen.findByText(/Informes simulados/)).toBeInTheDocument()
    expect(screen.getByText('Informe simulado · sin PDF')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver informe' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\d{2}-\d{2}-\d{4} \d{2}:\d{2}/ })).toHaveLength(30)
    expect(verInforme).not.toHaveBeenCalled()
  })
})
