import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  descargarExcelCruce,
  descargarInformesPDF,
  subirCruceABaseDeDatos,
} from '@/features/emitir'
import type { FilaSubida, MuestraGC, Solicitud } from '@/features/emitir'
import {
  construirCrucesAutomaticos,
  construirFilasExportables,
  muestrasSinSolicitud,
} from './cruceAutomatico'
import styles from './ResultadosAutomaticos.module.css'

function guardar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

export function ResultadosAutomaticos({
  solicitudes,
  muestras,
}: {
  solicitudes: Solicitud[]
  muestras: MuestraGC[]
}) {
  const [procesando, setProcesando] = useState<'pdf' | 'excel' | 'bd' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultadoSubida, setResultadoSubida] = useState<FilaSubida[] | null>(null)

  const cruces = useMemo(
    () => construirCrucesAutomaticos(solicitudes, muestras),
    [solicitudes, muestras],
  )
  const sinSolicitud = useMemo(
    () => muestrasSinSolicitud(solicitudes, muestras),
    [solicitudes, muestras],
  )
  const encontrados = cruces.filter((c) => c.muestra)
  const listos = encontrados.filter((c) => c.analitosFaltantes.length === 0)
  const sinResultado = cruces.filter((c) => !c.muestra)

  function filas() {
    return construirFilasExportables(cruces)
  }

  async function generarPDF() {
    const exportables = filas()
    if (!exportables.length) return
    setProcesando('pdf')
    setError(null)
    try {
      const { blob, nombre } = await descargarInformesPDF(exportables)
      guardar(blob, nombre ?? (exportables.length > 1 ? 'informes_cromatografia.zip' : 'informe.pdf'))
    } catch {
      setError('No se pudieron generar los informes PDF.')
    } finally {
      setProcesando(null)
    }
  }

  async function generarExcel() {
    const exportables = filas()
    if (!exportables.length) return
    setProcesando('excel')
    setError(null)
    try {
      guardar(await descargarExcelCruce(exportables), 'resultados_cromatografia.xlsx')
    } catch {
      setError('No se pudo generar el Excel de resultados.')
    } finally {
      setProcesando(null)
    }
  }

  async function subirBD() {
    const exportables = filas()
    if (!exportables.length) return
    setProcesando('bd')
    setError(null)
    setResultadoSubida(null)
    try {
      setResultadoSubida(await subirCruceABaseDeDatos(exportables))
    } catch {
      setError('No se pudieron subir los resultados a la base de datos.')
    } finally {
      setProcesando(null)
    }
  }

  return (
    <section className={styles.bloque}>
      <div className={styles.cabecera}>
        <div>
          <h4>Cruce automático</h4>
          <p>
            {encontrados.length} coincidencia(s) entre el archivo GC y las solicitudes recibidas.
            La fecha de recepción de cada informe es la del cruce, ya guardada en su solicitud.
          </p>
        </div>
      </div>

      <div className={styles.resumen}>
        <span className={styles.ok}>{listos.length} listos para emitir</span>
        <span>{sinResultado.length} solicitudes cruzadas sin resultado en este archivo</span>
        <span>{sinSolicitud.length} viales sin solicitud cruzada</span>
      </div>

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Solicitud</th>
              <th>N° muestra</th>
              <th>Sold To</th>
              <th>Especie</th>
              <th>Analitos solicitados</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cruces.map((cruce) => (
              <tr key={cruce.solicitud.archivo}>
                <td>{cruce.solicitud.campos['N° Solicitud'] || cruce.solicitud.archivo}</td>
                <td className={styles.mono}>{cruce.solicitud.codigo_muestra}</td>
                <td>{cruce.solicitud.campos['Sold To (Nombre)'] || '—'}</td>
                <td>{cruce.solicitud.campos.Especie || '—'}</td>
                <td>{cruce.solicitud.analitos_solicitados.join(', ') || '—'}</td>
                <td>
                  {!cruce.muestra ? (
                    <span className={styles.pendiente}>No viene en este GC</span>
                  ) : cruce.analitosFaltantes.length ? (
                    <span className={styles.revisar}>
                      Revisar: faltan {cruce.analitosFaltantes.join(', ')}
                    </span>
                  ) : (
                    <span className={styles.ok}>✓ Coincidencia exacta</span>
                  )}
                </td>
              </tr>
            ))}
            {cruces.length === 0 && (
              <tr><td colSpan={6} className={styles.vacio}>No hay solicitudes con muestra cruzada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sinSolicitud.length > 0 && (
        <details className={styles.detalle}>
          <summary>Ver {sinSolicitud.length} vial(es) sin solicitud cruzada</summary>
          <p>{sinSolicitud.map((m) => m.codigo).join(', ')}</p>
        </details>
      )}

      <div className={styles.acciones}>
        <Button onClick={() => void generarPDF()} disabled={!listos.length || procesando !== null}>
          {procesando === 'pdf' ? 'Generando…' : listos.length > 1 ? `Generar ${listos.length} informes PDF` : 'Generar informe PDF'}
        </Button>
        <Button variant="secondary" onClick={() => void generarExcel()} disabled={!listos.length || procesando !== null}>
          {procesando === 'excel' ? 'Generando…' : 'Descargar Excel de resultados'}
        </Button>
        <Button variant="secondary" onClick={() => void subirBD()} disabled={!listos.length || procesando !== null}>
          {procesando === 'bd' ? 'Subiendo…' : 'Subir resultados a la base'}
        </Button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {resultadoSubida && (
        <ul className={styles.resultado}>
          {resultadoSubida.map((r, i) => (
            <li key={`${r.nro_solicitud_original}-${r.codigo_vial}-${i}`}>
              {r.nro_solicitud_original} ({r.codigo_vial ?? '—'}):{' '}
              {r.estado === 'creada' ? `subida con folio ${r.folio}` : r.estado === 'ya_existia' ? `ya estaba subida (${r.folio})` : r.mensaje}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
