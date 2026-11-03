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
import { ID_BLOQUE } from '@/features/reportes/lib/bloquesAnalisis'

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

/** Los filtros son checks de varios valores: abre el desplegable de `etiqueta` y devuelve su caja. */
async function abrir(etiqueta: string) {
  const caja = (await screen.findByText(etiqueta, { selector: 'span' })).parentElement as HTMLElement
  fireEvent.click(within(caja).getByRole('button', { name: /▼|▲|Todos|seleccionados/ }))
  return caja
}
/** Marca o desmarca una opción de un desplegable ya abierto. */
const marcar = (caja: HTMLElement, texto: string) => fireEvent.click(within(caja).getByLabelText(texto))
const textoDelBoton = (caja: HTMLElement) => within(caja).getAllByRole('button')[0].textContent ?? ''

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
    marcar(await abrir('Laboratorio'), 'Laboratorio AgroFresh')
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

  it('FSMA y fitopatología traen su tabla por informe (con los gráficos apagados de fábrica)', async () => {
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    expect(within(fsma).getByRole('table')).toBeTruthy()
    expect(within(fsma).getByText('496251')).toBeTruthy()
    // Sin el interruptor de gráficos solo hay las tortas de presencia/ausencia (nada de línea de tiempo).
    const imagenes = within(fsma).getAllByRole('img')
    expect(imagenes.length).toBeGreaterThan(0)
    expect(imagenes.every((i) => /detectado/i.test(i.getAttribute('aria-label') ?? ''))).toBe(true)
    const fito = screen.getByRole('region', { name: 'Análisis de fitopatología' })
    expect(within(fito).getByText('253521-DIAG0003')).toBeTruthy()
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

  it('los filtros propios de FSMA salen en «Específicos» al mirar ese análisis, sin tocar los otros bloques', async () => {
    // jsdom no tiene diseño: se simula que la cabecera de FSMA ya pasó la barra y la de fitopatología aún no.
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      const top = this.id === ID_BLOQUE.fito ? 5000 : 0
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect
    }
    try {
      render(<ReporteView />)
      const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
      const estado = await screen.findByLabelText('Estado')
      expect(screen.queryByLabelText('Ingrediente Activo')).toBeNull()
      fireEvent.change(estado, { target: { value: 'no_detectado' } })
      expect(within(fsma).getByText('Ningún informe cumple los filtros de este análisis.')).toBeTruthy()
      expect(within(screen.getByRole('region', { name: 'Análisis de fitopatología' })).getByText('253521-DIAG0003')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'detectado' } })
      expect(within(fsma).getByText('496251')).toBeTruthy()
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it('FSMA se filtra por Especie: salen los informes de otra especie', async () => {
    const filas = [
      ...FILAS.filter((f) => !(f.laboratorio ?? '').startsWith('ALS')),
      fila({ solicitud_id: 3, nro_solicitud: '496251', laboratorio: 'ALS (Corthon)', ingrediente: 'ECOLI', valor_num: 50, especie: 'Pera' }),
      fila({ solicitud_id: 5, nro_solicitud: '496252', laboratorio: 'ALS (Corthon)', ingrediente: 'ECOLI', valor_num: 1, especie: 'Manzana' }),
    ]
    api.obtenerDatosReporte.mockResolvedValue({ filas, total: filas.length, total_solicitudes: 5 })
    render(<ReporteView />)
    const fsma = await screen.findByRole('region', { name: 'Análisis FSMA' })
    expect(within(fsma).getByText('496251')).toBeTruthy()
    marcar(await abrir('Especie'), 'Manzana')
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Análisis FSMA' })).queryByText('496251')).toBeNull())
    expect(within(screen.getByRole('region', { name: 'Análisis FSMA' })).getByText('496252')).toBeTruthy()
  })

  it('con FSMA a la vista el filtro de Especie sigue ahí (y el de Variedad no)', async () => {
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      const top = this.id === ID_BLOQUE.fito ? 5000 : 0
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect
    }
    try {
      render(<ReporteView />)
      await screen.findByLabelText('Estado')
      expect(screen.queryByText('Especie', { selector: 'span' })).not.toBeNull()
      expect(screen.queryByText('Variedad', { selector: 'span' })).toBeNull()
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it('los filtros de Report son checks: se pueden marcar dos especies a la vez', async () => {
    const filas = [
      fila({ solicitud_id: 1, nro_solicitud: 'OT-AGF0001', especie: 'Manzana' }),
      fila({ solicitud_id: 2, nro_solicitud: 'OT-AGF0002', especie: 'Pera' }),
      fila({ solicitud_id: 3, nro_solicitud: 'OT-AGF0003', especie: 'Kiwi' }),
    ]
    api.obtenerDatosReporte.mockResolvedValue({ filas, total: 3, total_solicitudes: 3 })
    render(<ReporteView />)
    const caja = await abrir('Especie')
    marcar(caja, 'Manzana')
    marcar(caja, 'Pera')
    await waitFor(() => expect(screen.getByText(/2 de 3 solicitudes/)).toBeTruthy())
    expect(textoDelBoton(caja)).toContain('2 seleccionados')
  })

  it('Ingrediente Activo parte con todos marcados; tocar uno deja solo ese, se suman más y Limpiar vuelve a marcar todos', async () => {
    const filas = [
      fila({ solicitud_id: 1, nro_solicitud: 'OT-AGF0001', ingrediente: 'FDL' }),
      fila({ solicitud_id: 2, nro_solicitud: 'OT-AGF0002', ingrediente: 'IMZ' }),
      fila({ solicitud_id: 3, nro_solicitud: 'OT-AGF0003', ingrediente: 'TEBU' }),
    ]
    api.obtenerDatosReporte.mockResolvedValue({ filas, total: 3, total_solicitudes: 3 })
    render(<ReporteView />)
    const caja = await abrir('Ingrediente Activo')
    const marcado = (t: string) => (within(caja).getByLabelText(t) as HTMLInputElement).checked
    expect(['FDL', 'IMZ', 'TEBU'].every(marcado)).toBe(true)
    marcar(caja, 'IMZ')
    expect([marcado('FDL'), marcado('IMZ'), marcado('TEBU')]).toEqual([false, true, false])
    marcar(caja, 'TEBU')
    expect([marcado('FDL'), marcado('IMZ'), marcado('TEBU')]).toEqual([false, true, true])
    fireEvent.click(within(caja).getByRole('button', { name: 'Limpiar' }))
    expect(['FDL', 'IMZ', 'TEBU'].every(marcado)).toBe(true)
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
    expect(textoDelBoton((await screen.findByText('Laboratorio', { selector: 'span' })).parentElement as HTMLElement)).toContain('Todos')
    fireEvent.click(quiteca)
    expect(agro.getAttribute('aria-pressed')).toBe('true')
  })

  it('el desplegable de Laboratorio usa los nombres completos', async () => {
    render(<ReporteView />)
    const caja = await abrir('Laboratorio')
    const textos = within(caja).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent ?? '')
    expect(textos.some((t) => t.startsWith('Laboratorio AgroFresh'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio Quiteca'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio ALS Global'))).toBe(true)
    expect(textos.some((t) => t.startsWith('Laboratorio Diagnofruit'))).toBe(true)
  })

  it('filtrando por AgroFresh queda solo el bloque de residuos, con Quiteca en gris', async () => {
    render(<ReporteView />)
    marcar(await abrir('Laboratorio'), 'Laboratorio AgroFresh')
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos']))
    const grupo = screen.getByRole('group', { name: 'Laboratorio del análisis de residuos' })
    expect(within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' }).getAttribute('aria-pressed')).toBe('true')
    const quiteca = within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' })
    expect(quiteca.getAttribute('aria-pressed')).toBe('false')
    expect(quiteca.getAttribute('title')).toMatch(/Quita el filtro de laboratorio/)
  })

  it('con AgroFresh filtrado, tocar Quiteca quita el filtro de laboratorio y vuelven todos los análisis', async () => {
    render(<ReporteView />)
    marcar(await abrir('Laboratorio'), 'Laboratorio AgroFresh')
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos']))
    fireEvent.click(screen.getByRole('button', { name: 'Laboratorio Quiteca' }))
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de residuos', 'Análisis FSMA', 'Análisis de fitopatología']))
    expect(textoDelBoton((await screen.findByText('Laboratorio', { selector: 'span' })).parentElement as HTMLElement)).toContain('Todos')
    const grupo = screen.getByRole('group', { name: 'Laboratorio del análisis de residuos' })
    expect(within(grupo).getByRole('button', { name: 'Laboratorio Quiteca' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(grupo).getByRole('button', { name: 'Laboratorio AgroFresh' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('filtrando por ALS queda solo el bloque FSMA, y por Diagnofruit solo el de fitopatología', async () => {
    render(<ReporteView />)
    const caja = await abrir('Laboratorio')
    marcar(caja, 'Laboratorio ALS Global')
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis FSMA']))
    marcar(caja, 'Laboratorio ALS Global')
    marcar(caja, 'Laboratorio Diagnofruit')
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis de fitopatología']))
    // con dos laboratorios marcados se ven los bloques de los dos
    marcar(caja, 'Laboratorio ALS Global')
    await waitFor(() => expect(titulosDeSeccion()).toEqual(['Análisis FSMA', 'Análisis de fitopatología']))
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
    const caja = await abrir('Tipo de servicio')
    expect(within(caja).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['Actimist', 'Línea de proceso'])
    marcar(caja, 'Actimist')
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
    const caja = await abrir('N° de línea')
    expect(within(caja).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['2', '10'])
    marcar(caja, '10')
    await waitFor(() => expect(screen.getByText(/1 de 3 solicitudes/)).toBeTruthy())
  })
})
