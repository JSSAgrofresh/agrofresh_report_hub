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
const sesion: { user: { tipoAcceso: string; email?: string } } = { user: { tipoAcceso: 'cliente' } }
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: sesion.user }) }))
const excel = vi.fn()
vi.mock('@/lib/excel', () => ({ descargarExcelDeFilas: (...a: unknown[]) => excel(...a) }))
vi.mock('./GraficoMedicion', () => ({ GraficoMedicion: ({ titulo }: { titulo: string }) => <div>grafico {titulo}</div> }))

import { InformesAccutabCliente } from './InformesAccutabCliente'

beforeEach(() => {
  desactivarSimulacion()
  sesion.user = { tipoAcceso: 'cliente' }
  verInforme.mockReset()
  excel.mockReset()
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
  it('muestra indicadores, el detalle del primer informe con sus gráficos de pH y ORP y sin tabla de mediciones', async () => {
    render(<InformesAccutabCliente />)
    expect(await screen.findByText('grafico pH')).toBeInTheDocument()
    expect(screen.getByText('grafico ORP')).toBeInTheDocument()
    expect(screen.getByText('Mediciones', { selector: 'span' })).toBeInTheDocument()
    expect(verInforme).toHaveBeenCalledWith('2026-10-02_10-00-00')
    expect(screen.getByRole('button', { name: 'Ver informe' })).toBeInTheDocument()
    expect(screen.queryByText('Tabla unificada')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('al elegir otro informe pide sus mediciones y el filtro Ship To acota la lista', async () => {
    render(<InformesAccutabCliente />)
    await screen.findByText('grafico pH')
    fireEvent.click(screen.getByRole('button', { name: /01-10-2026 10:00/ }))
    await waitFor(() => expect(verInforme).toHaveBeenCalledWith('2026-10-01_10-00-00'))
    fireEvent.click(screen.getByText('Ship To').parentElement!.querySelector('button')!)
    fireEvent.click(screen.getByRole('checkbox', { name: 'DOLE LONTUE' }))
    expect(screen.queryByRole('button', { name: /01-10-2026 10:00/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /02-10-2026 10:00/ })).toBeInTheDocument()
  })

  it('ofrece solo los filtros con algo que elegir (Ship To sí; Sold To, posición, equipo y semana, con un solo valor, no) más el rango, y no el período viejo', async () => {
    render(<InformesAccutabCliente />)
    await screen.findByText('grafico pH')
    ;['Ship To', 'Rango de fechas'].forEach((e) => expect(screen.getByText(e)).toBeInTheDocument())
    ;['Sold To', 'Posición de muestreo', 'Equipo', 'Semana'].forEach((e) => expect(screen.queryByText(e)).not.toBeInTheDocument())
    expect(screen.queryByText('Período')).not.toBeInTheDocument()
  })

  it('«BD de informes» baja una fila por informe y «BD de registros» junta las mediciones de todos los informes a la vista', async () => {
    render(<InformesAccutabCliente />)
    await screen.findByText('grafico pH')
    fireEvent.click(screen.getByRole('button', { name: 'BD de informes' }))
    expect(excel).toHaveBeenCalledTimes(1)
    expect(excel.mock.calls[0][0]).toBe('accutab-informes')
    expect(excel.mock.calls[0][2]).toHaveLength(3) // encabezado + 2 informes

    verInforme.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'BD de registros' }))
    await waitFor(() => expect(excel).toHaveBeenCalledTimes(2))
    expect(verInforme).toHaveBeenCalledTimes(2)
    expect(excel.mock.calls[1][0]).toBe('accutab-registros')
    expect(excel.mock.calls[1][2]).toHaveLength(3) // encabezado + 1 medición por informe
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
    sesion.user = { tipoAcceso: 'admin_general', email: 'jorge.sandoval@agrofresh.com' }
    render(<InformesAccutabCliente />)
    expect(await screen.findByText(/Informes simulados/)).toBeInTheDocument()
    expect(screen.getByText('Informe simulado · sin PDF')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver informe' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\d{2}-\d{2}-\d{4} \d{2}:\d{2}/ })).toHaveLength(30)
    expect(verInforme).not.toHaveBeenCalled()
  })
})
