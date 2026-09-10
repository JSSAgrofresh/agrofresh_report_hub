import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DetalleGCModal } from './DetalleGCModal'
import type { DetalleGC } from '@/features/emitir'

const DETALLE: DetalleGC = {
  cabecera: [
    { seccion: 'Instrumento y columna', campo: 'Instrument', valor: 'GC 2' },
    { seccion: 'Instrumento y columna', campo: 'Column Description', valor: 'TG-OCP-II' },
  ],
  muestras: [
    {
      codigo: 'GCNPD10062',
      seq_line: 14,
      fecha_inyeccion: '8/31/2026 12:54:49 PM',
      es_muestra: true,
      ubicacion: '17',
      resultados: [{ analito: 'DIFENILAMINA', codigo: 'DFA', area: 54.7, amount: 0.97, rettime: 7.6 }],
    },
  ],
}

/** Lo mismo, pero con el archivo y sus tramos: es lo que devuelve el backend
 * al subir el reporte. */
const CON_ARCHIVO: DetalleGC = {
  ...DETALLE,
  texto: [
    'Instrument: GC 2',
    'SEQUENCE TABLE:',
    'Line                : 1',
    'External Standard Report',
    'Warning : Negative results set to zero',
  ].join('\n'),
  regiones: [
    { inicio: 1, fin: 1, categoria: 'equipo' },
    { inicio: 2, fin: 3, categoria: 'secuencia' },
    { inicio: 4, fin: 4, categoria: 'resultado' },
    { inicio: 5, fin: 5, categoria: 'advertencia' },
  ],
  categorias: [
    { id: 'equipo', nombre: 'Configuración del equipo', hoja: 'Información del GC' },
    { id: 'secuencia', nombre: 'Tabla de la secuencia', hoja: 'Secuencia' },
    { id: 'resultado', nombre: 'Resultados del vial', hoja: 'Datos completos' },
    { id: 'advertencia', nombre: 'Advertencias del equipo', hoja: 'Área y PPM por vial' },
    { id: 'sinuso', nombre: 'Repetido o sin uso', hoja: null },
  ],
}

function montar(detalle: DetalleGC = DETALLE) {
  render(<DetalleGCModal detalle={detalle} nombreArchivo="31-8-26.txt" onCerrar={vi.fn()} />)
}

/** La vista previa y el Excel descargado tienen que mostrar lo mismo: si no,
 * quien revisa en pantalla y quien abre el archivo no miran la misma corrida. */
describe('DetalleGCModal', () => {
  it('encabeza la información del GC igual que la primera hoja del Excel', () => {
    montar()
    fireEvent.click(screen.getByRole('tab', { name: 'Información del GC' }))
    expect(screen.getByText('RESULTADOS DE ANÁLISIS CROMATOGRÁFICOS')).toBeTruthy()
    expect(screen.getByAltText('AgroFresh')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Sección' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Valor' })).toBeTruthy()
  })

  it('parte por la información del GC cuando el archivo no trae los tramos', () => {
    montar()
    expect(screen.queryByRole('tab', { name: 'Archivo del GC' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Información del GC' }).getAttribute('aria-selected')).toBe('true')
  })

  it('muestra la ubicación del carrusel en la vista por vial', () => {
    montar()
    fireEvent.click(screen.getByRole('tab', { name: 'Área y PPM por vial' }))
    expect(screen.getByRole('columnheader', { name: 'Ubicación de la muestra' })).toBeTruthy()
    expect(screen.getByText('17')).toBeTruthy()
  })

  /** Sin el tiempo de retención no se puede confirmar que el pico integrado
   * sea el del compuesto y no el de un vecino, que es justo lo que se revisa
   * en una curva de calibración. */
  it('trae ppm, tiempo de retención y área de cada compuesto en la vista por vial', () => {
    montar()
    fireEvent.click(screen.getByRole('tab', { name: 'Área y PPM por vial' }))
    const grupo = screen.getByRole('columnheader', { name: 'DIFENILAMINA' })
    expect((grupo as HTMLTableCellElement).colSpan).toBe(3)
    expect(screen.getByRole('columnheader', { name: 'ppm' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'tiempo ret.' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'área' })).toBeTruthy()
    expect(screen.getByText('7,6')).toBeTruthy()
  })
})


/** El archivo tal como salió del equipo, con cada parte de un color y la hoja
 * del Excel a la que va a parar. Es lo primero que se ve al subir el reporte:
 * de las ~9.500 líneas del archivo, los resultados son unas 600, y sin esto no
 * hay forma de saber de dónde sale cada número. */
describe('DetalleGCModal · visor del archivo', () => {
  it('se abre en el archivo y lo muestra tal como salió del equipo', () => {
    montar(CON_ARCHIVO)
    const pestana = screen.getByRole('tab', { name: 'Archivo del GC' })
    expect(pestana.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/Instrument: GC 2/)).toBeTruthy()
    expect(screen.getByText(/Warning : Negative results set to zero/)).toBeTruthy()
  })

  it('dice a qué hoja del Excel va a parar cada parte', () => {
    montar(CON_ARCHIVO)
    expect(screen.getAllByText('→ hoja «Secuencia»').length).toBeGreaterThan(0)
    // aparece dos veces: en la leyenda y en la etiqueta del tramo
    expect(screen.getAllByText('Advertencias del equipo').length).toBe(2)
  })

  it('no ofrece categorías que el archivo no trae', () => {
    montar(CON_ARCHIVO)
    expect(screen.queryByRole('button', { name: /Repetido o sin uso/ })).toBeNull()
  })

  it('deja ver una sola parte del archivo a la vez', () => {
    montar(CON_ARCHIVO)
    const chip = screen.getByRole('button', { name: /Advertencias del equipo/ })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Warning : Negative results set to zero/)).toBeTruthy()
    expect(screen.queryByText(/Instrument: GC 2/)).toBeNull()
    fireEvent.click(chip)
    expect(screen.getByText(/Instrument: GC 2/)).toBeTruthy()
  })

  it('cuenta las líneas del archivo y sus tramos', () => {
    montar(CON_ARCHIVO)
    expect(screen.getByText('5 línea(s) · 4 tramo(s)')).toBeTruthy()
  })
})
