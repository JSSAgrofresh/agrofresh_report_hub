import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { descargarPdfCarga, fechaDeCarpeta, nombreEquipo } from '@/features/postventa'
import type { ResumenCargaTrace } from '@/features/postventa'
import styles from './ReporteAccutab.module.css'

const POR_PAGINA = 10

/**
 * La tabla de informes del equipo de Post Venta (debajo del reporte, con los mismos filtros): bajar o generar cada
 * PDF y marcar varios para sacarlos del sistema. El cliente no la ve.
 */
export function TablaInformesAccutab({
  cargas,
  generando,
  onElegir,
  onGenerar,
  onEliminar,
}: {
  cargas: ResumenCargaTrace[]
  generando: string | null
  onElegir: (carpeta: string) => void
  onGenerar: (carpeta: string) => void
  onEliminar: (carpetas: string[]) => void
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [pagina, setPagina] = useState(0)
  const ultima = Math.max(0, Math.ceil(cargas.length / POR_PAGINA) - 1)
  const actual = Math.min(pagina, ultima)

  // Solo cuentan las marcadas que siguen a la vista: si un filtro esconde una, no se borra a escondidas.
  const visibles = cargas.filter((c) => marcadas.has(c.carpeta)).map((c) => c.carpeta)
  const todas = cargas.length > 0 && visibles.length === cargas.length

  function alternar(carpeta: string) {
    setMarcadas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(carpeta)) nuevas.delete(carpeta)
      else nuevas.add(carpeta)
      return nuevas
    })
  }

  function eliminar() {
    const n = visibles.length
    if (!n || !window.confirm(`¿Eliminar ${n} informe${n === 1 ? '' : 's'} del sistema? Se borran del servidor y de Storage, y no se puede deshacer.`)) return
    onEliminar(visibles)
    setMarcadas(new Set())
  }

  return (
    <Card aria-label="Informes">
      <div className={styles.tablaCabecera}>
        <div>
          <h2 className={styles.tablaTitulo}>Informes</h2>
          <p className={styles.tablaNota}>Un informe PDF por carga, con los mismos filtros de arriba. Marca los que quieras sacar del sistema.</p>
        </div>
        <button type="button" className={`${styles.botonExcel} ${styles.accionPeligro}`} disabled={visibles.length === 0} onClick={eliminar}>
          Eliminar seleccionados{visibles.length ? ` (${visibles.length})` : ''}
        </button>
      </div>
      <div className={styles.tablaEnvoltorio}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Marcar todos los informes que se ven"
                  checked={todas}
                  onChange={() => setMarcadas(todas ? new Set() : new Set(cargas.map((c) => c.carpeta)))}
                />
              </th>
              <th>Fecha</th>
              <th>Sold To</th>
              <th>Ship To</th>
              <th>Posición de muestreo</th>
              <th>Equipo</th>
              <th>Informe</th>
            </tr>
          </thead>
          <tbody>
            {cargas.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA).map((c) => (
              <tr key={c.carpeta}>
                <td>
                  <input type="checkbox" aria-label={`Marcar informe del ${fechaDeCarpeta(c.carpeta)}`} checked={marcadas.has(c.carpeta)} onChange={() => alternar(c.carpeta)} />
                </td>
                <td>
                  <button type="button" className={styles.enlace} onClick={() => onElegir(c.carpeta)}>
                    {fechaDeCarpeta(c.carpeta)}
                  </button>
                </td>
                <td>{c.cliente ?? '—'}</td>
                <td>{c.planta ?? '—'}</td>
                <td>{c.ubicacion ?? '—'}</td>
                <td>{c.equipo ? nombreEquipo(c.equipo) : '—'}</td>
                <td>
                  {c.tiene_pdf ? (
                    <button type="button" className={styles.enlace} onClick={() => void descargarPdfCarga(c.carpeta)}>
                      Descargar PDF
                    </button>
                  ) : (
                    <button type="button" className={styles.enlace} disabled={generando === c.carpeta} onClick={() => onGenerar(c.carpeta)}>
                      {generando === c.carpeta ? 'Generando…' : 'Generar informe'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cargas.length > POR_PAGINA && (
        <div className={styles.paginador}>
          <button type="button" className={styles.verMas} disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
            ← Anteriores
          </button>
          <span>
            Página {actual + 1} de {ultima + 1}
          </span>
          <button type="button" className={styles.verMas} disabled={actual >= ultima} onClick={() => setPagina(actual + 1)}>
            Siguientes →
          </button>
        </div>
      )}
    </Card>
  )
}
