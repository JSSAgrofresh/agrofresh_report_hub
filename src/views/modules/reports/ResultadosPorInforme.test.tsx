import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { InformeVista, ResultadoVista } from '@/features/reportes/lib/lineaTiempoInformes'
import { ResultadosPorInforme } from './ResultadosPorInforme'

afterEach(cleanup)

const COLT = { codigo: 'COLT', nombre: 'Coliformes Totales', unidad: 'UFC/100 mL', orden: 1 }
const ECOLI = { codigo: 'ECOLI', nombre: 'Escherichia coli', unidad: 'UFC/100 mL', orden: 2 }
const sin = (a: typeof COLT): ResultadoVista => ({ ...a, texto: '<1', valor: null, detectado: false })
const con = (a: typeof COLT, v: number): ResultadoVista => ({ ...a, texto: String(v), valor: v, detectado: true })
// Llegan de la base en cualquier orden; los dos analitos en orden cambiado en uno de los informes.
const INFORMES: InformeVista[] = [
  { nro: '496563', fecha: '2026-10-30', resultados: [sin(ECOLI), sin(COLT)] },
  { nro: '496251', fecha: '2026-10-01', resultados: [con(ECOLI, 50), con(COLT, 67)] },
  { nro: '496252', fecha: '2026-09-30', resultados: [con(COLT, 49), con(ECOLI, 15)] },
]

/** Las filas del cuerpo de la tabla (sin el encabezado ni el resumen). */
const filasDelCuerpo = (container: HTMLElement) => [...container.querySelectorAll('tbody tr')] as HTMLElement[]
const celdas = (fila: HTMLElement) => within(fila).getAllByRole('cell').map((c) => c.textContent)

describe('tabla por informe', () => {
  it('muestra la fecha, el informe y debajo una fila por analito con su unidad (el más nuevo arriba)', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    const columnas = within(screen.getByRole('table')).getAllByRole('columnheader').map((c) => c.textContent)
    expect(columnas.map((c) => c!.replace(/[↕▲▼]/g, '').trim())).toEqual(['Fecha de muestreo', 'N° de informe', 'Analito', 'Resultado', 'Unidad', 'Estado'])
    const filas = filasDelCuerpo(container)
    expect(filas).toHaveLength(6)
    // Primera fila del informe 496563: fecha, informe, analito, resultado, unidad, estado. Coliformes primero aunque llegue al revés.
    expect(celdas(filas[0])).toEqual(['30-10-2026viernes', '496563', 'Coliformes Totales', '<1', 'UFC/100 mL', 'Pendiente'])
    // La segunda fila solo trae lo suyo: el informe y la fecha se estiran hacia abajo.
    expect(celdas(filas[1])).toEqual(['Escherichia coli', '<1', 'UFC/100 mL', 'Pendiente'])
    expect(celdas(filas[2]).slice(1, 4)).toEqual(['496251', 'Coliformes Totales', '67'])
    expect(celdas(filas[3])[1]).toBe('50')
    expect((container.querySelector('tbody tr td') as HTMLTableCellElement).rowSpan).toBe(2)
  })

  it('en ALS cada analito dice «Pendiente»', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    const estados = filasDelCuerpo(container).map((f) => celdas(f).at(-1))
    expect(estados).toEqual(Array(6).fill('Pendiente'))
  })

  it('en Diagnofruit cada analito dice si detectó', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="diagnofruit" conGraficos={false} />)
    const filas = filasDelCuerpo(container)
    expect(celdas(filas[0]).at(-1)).toBe('No detectó')
    expect(celdas(filas[2]).at(-1)).toBe('Detectó')
  })

  it('el resumen dice en cuántos informes se detectó cada analito', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    const resumen = screen.getByText('Informes con detección por analito').parentElement!
    expect(resumen.textContent).toContain('Coliformes Totales 2 de 3')
    expect(resumen.textContent).toContain('Escherichia coli 2 de 3')
    expect(resumen.textContent).toContain('Con alguna detección 2 de 3')
  })

  it('el día de la semana va bajo la fecha', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    expect(screen.getByText('jueves')).toBeTruthy()
  })

  it('tocar un encabezado ordena y tocarlo otra vez lo invierte', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    const orden = () => [...container.querySelectorAll('tbody [class*="informe"]')].map((e) => e.textContent)
    fireEvent.click(screen.getByRole('button', { name: /N° de informe/ }))
    expect(orden()).toEqual(['496251', '496252', '496563']) // ascendente
    fireEvent.click(screen.getByRole('button', { name: /N° de informe/ }))
    expect(orden()).toEqual(['496563', '496252', '496251'])
    expect(screen.getByRole('columnheader', { name: /N° de informe/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('el buscador filtra por N° y avisa cuando nada calza', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    const buscador = screen.getByLabelText('Buscar informe')
    fireEvent.change(buscador, { target: { value: '496563' } })
    expect([...container.querySelectorAll('tbody [class*="informe"]')].map((e) => e.textContent)).toEqual(['496563'])
    expect(screen.getByText('Mostrando 1–1 de 1 informe (de 3)')).toBeTruthy()
    fireEvent.change(buscador, { target: { value: 'zzz' } })
    expect(screen.getByText('Ningún informe calza con la búsqueda.')).toBeTruthy()
    expect(screen.getByText(/^Sin informes/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Descargar CSV' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('pagina: 30 informes en páginas de 25', () => {
    const muchos: InformeVista[] = Array.from({ length: 30 }, (_, i) => ({
      nro: String(500000 + i),
      fecha: '2026-10-01',
      resultados: [sin(COLT), sin(ECOLI)],
    }))
    const { container } = render(<ResultadosPorInforme informes={muchos} laboratorio="als" conGraficos={false} />)
    expect(container.querySelectorAll('tbody [class*="informe"]')).toHaveLength(25)
    expect(screen.getByText('Mostrando 1–25 de 30 informes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    expect(container.querySelectorAll('tbody [class*="informe"]')).toHaveLength(5)
    expect(screen.getByText('Mostrando 26–30 de 30 informes')).toBeTruthy()
    expect(screen.getByText('Página 2 de 2')).toBeTruthy()
  })

  it('«Descargar CSV» baja lo que se ve, ordenado y filtrado', () => {
    const crear = vi.fn(() => 'blob:prueba')
    const revocar = vi.fn()
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: revocar })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }))
    expect(crear).toHaveBeenCalledTimes(1)
    const blob = (crear.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toContain('text/csv')
    expect(clic).toHaveBeenCalled()
    expect(revocar).toHaveBeenCalledWith('blob:prueba')
    clic.mockRestore()
  })
})

describe('gráficos apagados o encendidos', () => {
  it('apagados (de fábrica) queda solo la tabla: ni línea de tiempo ni serie', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos={false} />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Resultados por informe')).toBeTruthy()
    expect(screen.queryByText('Evolución de los resultados')).toBeNull()
  })

  it('encendidos, la línea de tiempo y la serie van sobre la tabla', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos />)
    expect(screen.getByRole('img', { name: /Línea de tiempo/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
    expect(screen.getByText('Detalle por informe')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('la línea de tiempo corta el eje cuando pasan días sin muestras y dice cuántos', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos />)
    expect(screen.getAllByText('29 días después').length).toBeGreaterThan(0)
  })

  it('cada punto dice su informe, su fecha y su valor al pasar el mouse', () => {
    const { container } = render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos />)
    const titulos = [...container.querySelectorAll('title')].map((t) => t.textContent)
    expect(titulos).toContain('496251 · 01-10-2026 · Coliformes Totales: 67 UFC/100 mL')
    expect(titulos).toContain('496563 · 30-10-2026 · Escherichia coli: <1 UFC/100 mL')
  })

  it('el día de la semana va junto a la fecha en la línea de tiempo', () => {
    render(<ResultadosPorInforme informes={INFORMES} laboratorio="als" conGraficos />)
    expect(screen.getAllByText('jueves · 1 informe').length).toBeGreaterThan(0)
  })

  it('con analitos de otra unidad hay una serie de tiempo por unidad y la leyenda sale una sola vez', () => {
    const ALIM = { codigo: 'COLA', nombre: 'Coliformes Totales', unidad: 'UFC/g', orden: 3 }
    render(<ResultadosPorInforme laboratorio="als" conGraficos informes={[{ nro: '1', fecha: '2026-10-01', resultados: [con(COLT, 5), con(ALIM, 300)] }]} />)
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/100 mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/g/ })).toBeTruthy()
    expect(screen.getAllByText('No se detectó (queda en cero)')).toHaveLength(1)
  })
})

// ── Diagnofruit: el mismo componente, con sus cinco patógenos, la zona de muestreo y «BLD» ──
const PAT = {
  LEV: { codigo: 'LEV', nombre: 'Levaduras', unidad: 'UFC/mL', orden: 1 },
  BOT: { codigo: 'BOT', nombre: 'Botrytis', unidad: 'conidia/mL', orden: 2 },
  GEO: { codigo: 'GEO', nombre: 'Geotrichum', unidad: 'esporas/mL', orden: 4 },
}
const bld = (a: typeof PAT.LEV): ResultadoVista => ({ ...a, texto: 'BLD', valor: null, detectado: false })
const hay = (a: typeof PAT.LEV, texto: string, valor: number | null): ResultadoVista => ({ ...a, texto, valor, detectado: true })
const DIAGNO: InformeVista[] = [
  { nro: '253522-DIAG0007', fecha: '2026-10-01', detalle: 'Pozo vaciado', resultados: [bld(PAT.LEV), hay(PAT.BOT, '5,2', 5.2), bld(PAT.GEO)] },
  { nro: '253521-DIAG0003', fecha: '2026-10-01', detalle: null, resultados: [hay(PAT.LEV, '>100', 100), hay(PAT.BOT, '4,66', 4.66), hay(PAT.GEO, '49,91', 49.91)] },
]

describe('con Diagnofruit', () => {
  it('la tabla trae la zona de muestreo y una fila por patógeno con su unidad', () => {
    const { container } = render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" conGraficos={false} />)
    const columnas = within(screen.getByRole('table')).getAllByRole('columnheader').map((c) => c.textContent)
    expect(columnas[2]).toContain('Zona de muestreo')
    const filas = filasDelCuerpo(container)
    expect(filas).toHaveLength(6)
    // Los dos informes son del mismo día: la fecha se estira por las seis filas y el más nuevo (por N°) va arriba.
    expect(celdas(filas[0])).toEqual(['01-10-2026jueves', '253522-DIAG0007', 'Pozo vaciado', 'Levaduras', 'BLD', 'UFC/mL', 'No detectó'])
    expect((container.querySelector('tbody tr td') as HTMLTableCellElement).rowSpan).toBe(6)
    expect(celdas(filas[1])).toEqual(['Botrytis', '5,2', 'conidia/mL', 'Detectó'])
    // el otro informe no trae zona: queda en «—»
    expect(celdas(filas[3]).slice(0, 4)).toEqual(['253521-DIAG0003', '—', 'Levaduras', '>100'])
    expect(celdas(filas[5]).slice(0, 2)).toEqual(['Geotrichum', '49,91'])
  })

  it('la nota habla de BLD, no de «<1»', () => {
    render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" conGraficos={false} />)
    expect(screen.getByText(/«BLD»: bajo el límite de detección/)).toBeTruthy()
    expect(screen.queryByText(/«<1»/)).toBeNull()
  })

  it('con los gráficos encendidos hay una serie por unidad y los informes se rotulan por su OT', () => {
    const { container } = render(<ResultadosPorInforme informes={DIAGNO} laboratorio="diagnofruit" conGraficos />)
    expect(screen.getByRole('img', { name: /Serie de tiempo.*UFC\/mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*conidia\/mL/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Serie de tiempo.*esporas\/mL/ })).toBeTruthy()
    const rotulos = [...container.querySelectorAll('svg text')].map((t) => t.textContent)
    expect(rotulos).toContain('DIAG0003')
    expect(rotulos).not.toContain('253521-DIAG0003')
    expect(rotulos).toContain('>100')
  })
})
