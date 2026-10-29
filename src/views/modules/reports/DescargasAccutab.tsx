import { useState } from 'react'
import { descargarExcelDeFilas } from '@/lib/excel'
import {
  LIMITE_FILAS_EXCEL,
  filasBdInformes,
  filasBdRegistros,
  reunirDetalles,
  totalMediciones,
} from '@/features/postventa'
import type { CargaTrace, ResumenCargaTrace } from '@/features/postventa'
import styles from './ReporteAccutab.module.css'

const ICONO = (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
  </svg>
)

/**
 * Los dos Excel del reporte, de lo que está a la vista (con los filtros puestos):
 *  - «BD de registros»: todas las mediciones de pH y ORP, una fila cada una, con los datos de su informe.
 *  - «BD de informes»: una fila por informe.
 * La carpeta completa de una planta se baja desde Storage → Informes, no desde acá.
 */
export function DescargasAccutab({
  filtradas,
  verCarga,
}: {
  filtradas: ResumenCargaTrace[]
  verCarga: (carpeta: string) => Promise<CargaTrace>
}) {
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const mediciones = totalMediciones(filtradas)

  async function bajarRegistros() {
    setAviso(null)
    if (mediciones > LIMITE_FILAS_EXCEL) {
      setAviso(
        `Con estos filtros son ${mediciones.toLocaleString('es-CL')} mediciones y un Excel admite hasta ${LIMITE_FILAS_EXCEL.toLocaleString('es-CL')}. Acota por fechas, planta o equipo.`,
      )
      return
    }
    setAvance({ hechas: 0, total: filtradas.length })
    try {
      const detalles = await reunirDetalles(filtradas, verCarga, (hechas, total) => setAvance({ hechas, total }))
      descargarExcelDeFilas('accutab-registros', 'Registros', filasBdRegistros(filtradas, detalles))
    } catch {
      setAviso('No pudimos reunir todas las mediciones. No se descargó nada: intenta de nuevo.')
    } finally {
      setAvance(null)
    }
  }

  const ocupado = avance !== null
  return (
    <div className={styles.descargas}>
      <div className={styles.descargasBotones}>
        <button type="button" className={styles.botonExcel} disabled={ocupado || filtradas.length === 0} onClick={() => void bajarRegistros()}>
          {ICONO}
          {avance ? `Reuniendo ${avance.hechas}/${avance.total}…` : 'BD de registros'}
        </button>
        <button
          type="button"
          className={styles.botonExcel}
          disabled={ocupado || filtradas.length === 0}
          onClick={() => descargarExcelDeFilas('accutab-informes', 'Informes', filasBdInformes(filtradas))}
        >
          {ICONO}
          BD de informes
        </button>
      </div>
      {aviso && (
        <p className={styles.avisoDescarga} role="alert">
          {aviso}
        </p>
      )}
    </div>
  )
}
