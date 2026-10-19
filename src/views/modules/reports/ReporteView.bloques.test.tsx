/**
 * Report normal: los resultados van en bloques por tipo de análisis, hacia abajo y en este orden:
 * Análisis de residuos (Laboratorio AgroFresh y Laboratorio Quiteca), Análisis FSMA (Laboratorio ALS Global) y
 * Análisis de fitopatología (Laboratorio Diagnofruit). Sin elegir laboratorio se ven los tres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FilaReporte } from '@/features/reportes'

// jsdom no dibuja canvas: Chart.js se reemplaza por un doble que no hace nada.
vi.mock('chart.js', () => {
  const Chart = Object.assign(class { destroy() {} update() {} }, { register: () => {} })
  return {
    Chart, ArcElement: {}, BarController: {}, BarElement: {}, CategoryScale: {}, DoughnutController: {}, Filler: {},
    Legend: {}, LinearScale: {}, LineController: {}, LineElement: {}, PointElement: {}, Tooltip: {},
  }
})

const api = vi.hoisted(() => ({
  obtenerDatosReporte: vi.fn(),
  listarAnalitos: vi.fn(),
  listarLimites: vi.fn(),
  obtenerVistaReport: vi.fn(),
}))
vi.mock('@/features/reportes', async (importar) => ({ ...(await importar<typeof import('@/features/reportes')>()), ...api }))
vi.mock('@/features/listados', () => ({ listarValores: vi.fn().mockResolvedValue([]), listarEspeciesActivas: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { tipoAcceso: 'admin_general', email: 'jorge.sandoval@agrofresh.com', nombre: 'Jorge' } }) }))

import { ReporteView } from './ReporteView'

const fila = (p: Partial<FilaReporte>): FilaReporte => ({
  solicitud_id: 1, nro_solicitud: 'X', laboratorio: 'Agrofresh', fecha_muestreo: '2026-10-01', fecha_entrada: '2026-10-01',
  especie: 'Manzana', variedad: 'Gala', semana_muestreo: 40, mes: 10, temporada: 2026, tipo_servicio: null, posicion_muestreo: null,
  cliente: 'DOLE', planta: 'DOLE LONTUE', tipo_aplicacion: null, ingrediente: 'FDL', valor_num: 1, valor_texto: null, ...p,
})

const FILAS: FilaReporte[] = [
  fila({ solicitud_id: 1, nro_solicitud: 'OT-AGF0001', laboratorio: 'Agrofresh', ingrediente: 'FDL', valor_num: 1.5 }),
  fila({ solicitud_id: 2, nro_solicitud: '2026-1885-PC', laboratorio: 'Quiteca', ingrediente: 'IMZ', valor_num: 2.1 }),
  fila({ solicitud_id: 3, nro_solicitud: '496251', laboratorio: 'ALS (Corthon)', ingrediente: 'ECOLI', valor_num: 50 }),
  fila({ solicitud_id: 3, nro_solicitud: '496251', laboratorio: 'ALS (Corthon)', ingrediente: 'COLT', valor_num: 67 }),
  fila({ solicitud_id: 4, nro_solicitud: '253521-DIAG0003', laboratorio: 'Diagnofruit', ingrediente: 'LEV', valor_num: null, valor_texto: 'BLD' }),
]

const titulosDeSeccion = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  api.obtenerDatosReporte.mockResolvedValue({ filas: FILAS, total: FILAS.length, total_solicitudes: 4 })
  api.listarAnalitos.mockResolvedValue([])
  api.listarLimites.mockResolvedValue([])
  api.obtenerVistaReport.mockResolvedValue({ graficos_informes: false })
})

describe('Report por bloques de análisis', () => {
  it('con «Todos» se ven los tres bloques hacia abajo: residuos, FSMA y fitopatología', async () => {
    render(<ReporteView />)
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos', 'Análisis FSMA', 'Análisis de fitopatología']))
  })

  it('cada bloque lleva su laboratorio con el nombre completo', async () => {
    render(<ReporteView />)
    await screen.findByRole('heading', { level: 2, name: 'Análisis FSMA' })
    const fsma = screen.getByRole('region', { name: 'Análisis FSMA' })
    expect(within(fsma).getAllByText('Laboratorio ALS Global').length).toBeGreaterThan(0)
    const fito = screen.getByRole('region', { name: 'Análisis de fitopatología' })
    expect(within(fito).getAllByText('Laboratorio Diagnofruit').length).toBeGreaterThan(0)
    const grupo = screen.getByRole('group', { name: 'Laboratorio del análisis de residuos' })
    expect(within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' })).toBeTruthy()
    expect(within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' })).toBeTruthy()
  })

  it('FSMA y fitopatología traen su tabla por informe (con los gráficos apagados de fábrica)', async () => {
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    expect(within(fsma).getByRole('table')).toBeTruthy()
    expect(within(fsma).getByText('496251')).toBeTruthy()
    expect(within(fsma).queryByRole('img')).toBeNull()
    const fito = screen.getByRole('region', { name: 'Análisis de fitopatología' })
    expect(within(fito).getByText('253521-DIAG0003')).toBeTruthy()
  })

  it('los dos botones de residuos parten encendidos; tocar uno deja solo ese y tocarlo otra vez los vuelve a encender', async () => {
    render(<ReporteView />)
    const grupo = await screen.findByRole('group', { name: 'Laboratorio del análisis de residuos' })
    const agro = within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' })
    const quiteca = within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' })
    expect(agro.getAttribute('aria-pressed')).toBe('true')
    expect(quiteca.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(quiteca)
    expect(agro.getAttribute('aria-pressed')).toBe('false')
    expect(quiteca.getAttribute('aria-pressed')).toBe('true')
    // tocar un botón no cambia los otros bloques ni el filtro de arriba
    expect(titulosDeSeccion()).toEqual(['Análisis de residuos', 'Análisis FSMA', 'Análisis de fitopatología'])
    expect((screen.getByLabelText('Laboratorio') as HTMLSelectElement).value).toBe('')
    fireEvent.click(quiteca)
    expect(agro.getAttribute('aria-pressed')).toBe('true')
  })

  it('el desplegable de Laboratorio usa los nombres completos', async () => {
    render(<ReporteView />)
    const select = (await screen.findByLabelText('Laboratorio')) as HTMLSelectElement
    const textos = [...select.options].map((o) => o.textContent ?? '')
    expect(textos[0]).toBe('Todos')
    expect(textos.some((t) => t.startsWith('Laboratorio AgroFresh'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio Quiteca'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio ALS Global'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio Diagnofruit'))).toBe(true)
  })

  it('filtrando por AgroFresh queda solo el bloque de residuos, con Quiteca en gris', async () => {
    render(<ReporteView />)
    const select = (await screen.findByLabelText('Laboratorio')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Agrofresh' } })
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos']))
    const grupo = screen.getByRole('group', { name: 'Laboratorio del análisis de residuos' })
    expect(within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' }).getAttribute('aria-pressed')).toBe('true')
    const quiteca = within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' })
    expect(quiteca.getAttribute('aria-pressed')).toBe('false')
    expect(quiteca.getAttribute('title')).toMatch(/Quita el filtro de laboratorio/)
  })

  it('con AgroFresh filtrado, tocar Quiteca quita el filtro de laboratorio y vuelven todos los análisis', async () => {
    render(<ReporteView />)
    const select = (await screen.findByLabelText('Laboratorio')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Agrofresh' } })
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos']))
    fireEvent.click(screen.getByRole('button', { name: 'Laboratorio Quiteca' }))
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos', 'Análisis FSMA', 'Análisis de fitopatología']))
    expect((screen.getByLabelText('Laboratorio') as HTMLSelectElement).value).toBe('')
    const grupo = screen.getByRole('group', { name: 'Laboratorio del análisis de residuos' })
    expect(within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('filtrando por ALS queda solo el bloque FSMA, y por Diagnofruit solo el de fitopatología', async () => {
    render(<ReporteView />)
    const select = (await screen.findByLabelText('Laboratorio')) as HTMLSelectElement
    const valores = [...select.options].map((o) => o.value)
    fireEvent.change(select, { target: { value: valores.find((v) => /als/i.test(v))! } })
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis FSMA']))
    fireEvent.change(select, { target: { value: valores.find((v) => /diagno/i.test(v))! } })
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de fitopatología']))
  })

  it('con los gráficos encendidos en Funciones, FSMA y fitopatología los muestran', async () => {
    api.obtenerVistaReport.mockResolvedValue({ graficos_informes: true })
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    await waitFor(() => expect(within(fsma).getByRole('img', { name: /Línea de tiempo/ })).toBeTruthy())
  })
})
