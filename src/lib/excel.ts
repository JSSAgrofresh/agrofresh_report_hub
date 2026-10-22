import * as XLSX from 'xlsx'
import { guardarBlob } from '@/services/http/descargar'

/** Una celda de Excel: texto, número o vacía. */
export type CeldaExcel = string | number | null | undefined

/** El nombre de una hoja de Excel: hasta 31 letras y sin `[ ] : * ? / \`. */
export function nombreDeHoja(nombre: string): string {
  const limpio = nombre.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim()
  return (limpio || 'Hoja').slice(0, 31)
}

/** `informes-2026-10-22.xlsx`: el nombre del archivo con la fecha de hoy. */
export function nombreDeArchivo(base: string, hoy = new Date()): string {
  const limpio = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tabla'
  return `${limpio}-${hoy.toISOString().slice(0, 10)}.xlsx`
}

function entregar(hoja: XLSX.WorkSheet, nombreHoja: string, archivo: string): void {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, nombreDeHoja(nombreHoja))
  const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  guardarBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreDeArchivo(archivo))
}

/** Baja un Excel con una hoja: la primera fila son los encabezados. */
export function descargarExcelDeFilas(archivo: string, nombreHoja: string, filas: CeldaExcel[][]): void {
  entregar(XLSX.utils.aoa_to_sheet(filas.map((f) => f.map((c) => c ?? ''))), nombreHoja, archivo)
}

/** Baja un Excel con lo que se ve en una tabla HTML (incluidas las celdas combinadas), tal como está escrito en pantalla. */
export function descargarExcelDeTabla(archivo: string, nombreHoja: string, tabla: HTMLTableElement): void {
  entregar(XLSX.utils.table_to_sheet(tabla, { raw: true }), nombreHoja, archivo)
}
