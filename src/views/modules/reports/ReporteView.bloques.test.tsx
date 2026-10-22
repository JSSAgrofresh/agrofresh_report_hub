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

  it('cada bloque lleva su número correlativo en un círculo, solo cuando se ven varios', async () => {
    render(<ReporteView />)
    await screen.findByRole('heading', { level: 2, name: 'Análisis FSMA' })
    expect(screen.getByLabelText('Análisis 1').textContent).toBe('1')
    expect(screen.getByLabelText('Análisis 2').textContent).toBe('2')
    expect(screen.getByLabelText('Análisis 3').textContent).toBe('3')
    fireEvent.change(screen.getByLabelText('Laboratorio'), { target: { value: 'Agrofresh' } })
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos']))
    expect(screen.queryByLabelText('Análisis 1')).toBeNull()
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

  it('FSMA y fitopatología traen sus gráficos de línea de tiempo Y las tortas, más su tabla por informe', async () => {
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    const tabla = within(fsma).getByRole('table')
    expect(within(tabla).getByText('496251')).toBeTruthy()
    // Las tortas se agregan a lo que ya había: la línea de tiempo y la evolución siguen ahí.
    expect(within(fsma).getByText('Evolución de los resultados')).toBeTruthy()
    expect(within(fsma).getByText('Presencia y ausencia')).toBeTruthy()
    const fito = screen.getByRole('region', { name: 'Análisis de fitopatología' })
    expect(within(within(fito).getByRole('table')).getByText('253521-DIAG0003')).toBeTruthy()
    expect(within(fito).getByText('Evolución de los resultados')).toBeTruthy()
  })

  it('FSMA trae una torta por analito y fitopatología, además, una por nivel de contaminación', async () => {
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    expect(within(fsma).getByText('Presencia y ausencia')).toBeTruthy()
    expect(within(fsma).getByRole('img', { name: /^Coliformes Totales: No detectado 0 de 1, Detectado 1 de 1/ })).toBeTruthy()
    expect(within(fsma).getByRole('img', { name: /^Escherichia coli: No detectado 0 de 1, Detectado 1 de 1/ })).toBeTruthy()
    const fito = screen.getByRole('region', { name: 'Análisis de fitopatología' })
    expect(within(fito).getByText('Presencia y ausencia')).toBeTruthy()
    expect(within(fito).queryByText('Nivel de contaminación')).toBeNull() // Levaduras no tiene tabla de límites
  })

  it('los filtros propios de FSMA dejan un analito y el estado, sin tocar los otros bloques', async () => {
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    fireEvent.change(within(fsma).getByLabelText('Estado'), { target: { value: 'no_detectado' } })
    expect(within(fsma).getByText('Ningún informe cumple los filtros de este análisis.')).toBeTruthy()
    expect(within(within(screen.getByRole('region', { name: 'Análisis de fitopatología' })).getByRole('table')).getByText('253521-DIAG0003')).toBeTruthy()
    fireEvent.change(within(fsma).getByLabelText('Estado'), { target: { value: 'detectado' } })
    expect(within(within(fsma).getByRole('table')).getByText('496251')).toBeTruthy()
  })

  it('filtrar por Especie no vacía FSMA: ALS no informa especie, así que ese filtro no se le aplica', async () => {
    const sinEspecie = FILAS.map((f) => ((f.laboratorio ?? '').startsWith('ALS') ? { ...f, especie: null as never } : f))
    api.obtenerDatosReporte.mockResolvedValue({ filas: sinEspecie, total: sinEspecie.length, total_solicitudes: 4 })
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    expect(within(within(fsma).getByRole('table')).getByText('496251')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Especie'), { target: { value: 'Manzana' } })
    await waitFor(() => expect(screen.getByLabelText('Especie')).toHaveProperty('value', 'Manzana'))
    expect(within(within(screen.getByRole('region', { name: 'Análisis FSMA' })).getByRole('table')).getByText('496251')).toBeTruthy()
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

  it('el filtro «Tipo de servicio» ofrece los servicios de los datos y filtra', async () => {
    api.obtenerDatosReporte.mockResolvedValue({
      filas: [
        fila({ solicitud_id: 1, nro_solicitud: 'OT-AGF0001', servicio: 'actimist' }),
        fila({ solicitud_id: 2, nro_solicitud: 'OT-AGF0002', servicio: null }),
      ],
      total: 2,
      total_solicitudes: 2,
    })
    render(<ReporteView />)
    const select = (await screen.findByText('Tipo de servicio', { selector: 'span' })).parentElement!.querySelector('select')!
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todos', 'Actimist', 'Línea de proceso'])
    fireEvent.change(select, { target: { value: 'Actimist' } })
    await waitFor(() => expect(screen.getByText(/1 de 2 solicitudes/)).toBeTruthy())
  })

  it('el filtro «N° de línea» ofrece las líneas de los datos y filtra', async () => {
    api.obtenerDatosReporte.mockResolvedValue({
      filas: [
        fila({ solicitud_id: 1, nro_solicitud: 'OT-AGF0001', nro_linea: '2' }),
        fila({ solicitud_id: 2, nro_solicitud: 'OT-AGF0002', nro_linea: '10' }),
        fila({ solicitud_id: 3, nro_solicitud: 'OT-AGF0003', nro_linea: null }),
      ],
      total: 3,
      total_solicitudes: 3,
    })
    render(<ReporteView />)
    const select = (await screen.findByText('N° de línea', { selector: 'span' })).parentElement!.querySelector('select')!
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todas', '2', '10'])
    fireEvent.change(select, { target: { value: '10' } })
    await waitFor(() => expect(screen.getByText(/1 de 3 solicitudes/)).toBeTruthy())
  })
})
