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

function montar() {
  render(<DetalleGCModal detalle={DETALLE} nombreArchivo="31-8-26.txt" onCerrar={vi.fn()} />)
}

/** La vista previa y el Excel descargado tienen que mostrar lo mismo: si no,
 * quien revisa en pantalla y quien abre el archivo no miran la misma corrida. */
describe('DetalleGCModal', () => {
  it('encabeza la información del GC igual que la primera hoja del Excel', () => {
    montar()
    expect(screen.getByText('RESULTADOS DE ANÁLISIS CROMATOGRÁFICOS')).toBeTruthy()
    expect(screen.getByAltText('AgroFresh')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Sección' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Valor' })).toBeTruthy()
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
