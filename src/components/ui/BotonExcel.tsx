import type { RefObject } from 'react'
import { descargarExcelDeFilas, descargarExcelDeTabla, type CeldaExcel } from '@/lib/excel'
import styles from './BotonExcel.module.css'

interface Props {
  /** Base del nombre del archivo y de la hoja («informes-enviados» → informes-enviados-2026-10-22.xlsx). */
  archivo: string
  /** Si se da, se baja lo que hay en la primera `<table>` de ese contenedor (lo que se ve en pantalla). */
  contenedor?: RefObject<HTMLElement | null>
  /** Alternativa sin tabla en pantalla: las filas (la primera son los encabezados). */
  filas?: CeldaExcel[][]
  disabled?: boolean
  etiqueta?: string
}

const ICONO = (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
  </svg>
)

/** «Descargar Excel» de una tabla del Panel de control interno. */
export function BotonExcel({ archivo, contenedor, filas, disabled, etiqueta = 'Excel' }: Props) {
  function bajar() {
    if (filas) return descargarExcelDeFilas(archivo, archivo, filas)
    const tabla = contenedor?.current?.querySelector('table')
    if (tabla) descargarExcelDeTabla(archivo, archivo, tabla)
  }
  return (
    <button type="button" className={styles.boton} disabled={disabled} onClick={bajar} title="Descargar esta tabla en Excel" aria-label={`Descargar ${archivo} en Excel`}>
      {ICONO}
      {etiqueta}
    </button>
  )
}
