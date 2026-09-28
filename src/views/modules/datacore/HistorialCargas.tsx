import { useEffect, useState } from 'react'
import { deshacerCarga, listarCargas } from '@/features/ingest'
import type { CargaDatos, HistorialCargas as Historial } from '@/features/ingest'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './IngestaInicio.module.css'

interface Props {
  /** Cambia cuando otra parte de la pantalla movió datos: hay que releer. */
  version: number
  onCambio: () => void
}

function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Las últimas cargas a la base, cada una con lo que tiene HOY (los conteos
 * los calcula el backend al leer) y un botón para deshacerla: borra
 * exactamente lo que trajo esa carga, sin tocar las demás.
 */
export function HistorialCargas({ version, onCambio }: Props) {
  const [historial, setHistorial] = useState<Historial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  useEffect(() => {
    let vigente = true
    listarCargas()
      .then((h) => {
        if (vigente) setHistorial(h)
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof Error ? e.message : 'No se pudo leer el historial de cargas.')
      })
    return () => {
      vigente = false
    }
  }, [version])

  async function deshacer(c: CargaDatos) {
    const partes = [
      cantidad(c.solicitudes, 'informe', 'informes'),
      cantidad(c.resultados, 'resultado', 'resultados'),
    ]
    if (c.pendientes) partes.push(cantidad(c.pendientes, 'fila pendiente', 'filas pendientes'))
    const aviso =
      `Se borrará todo lo que trajo esta carga: ${partes.join(', ')}.\n\n` +
      'Las demás cargas no se tocan. Esto no se puede recuperar.'
    if (!window.confirm(aviso)) return
    setOcupado(c.id)
    setMensaje(null)
    setError(null)
    try {
      const r = await deshacerCarga(c.id)
      setMensaje(
        `Carga deshecha: se borraron ${cantidad(r.solicitudes, 'informe', 'informes')} y ` +
          `${cantidad(r.resultados, 'resultado', 'resultados')}.`,
      )
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo deshacer la carga.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className={styles.bloque} aria-labelledby="historial-titulo">
      <div className={styles.bloqueCab}>
        <h2 id="historial-titulo" className={styles.bloqueTitulo}>
          Últimas cargas
        </h2>
        <span className={styles.bloqueAyuda}>
          Cada carga se puede deshacer completa, sin tocar las demás.
        </span>
      </div>

      {mensaje && <p className={styles.ok}>{mensaje}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {historial === null && !error && <p className={styles.vacio}>Cargando historial…</p>}

      {historial && !historial.disponible && (
        <p className={styles.vacio}>
          El historial de cargas se activa al correr la migración{' '}
          <code>0042_cargas_de_datos.sql</code> en el servidor.
        </p>
      )}

      {historial?.disponible && historial.cargas.length === 0 && (
        <p className={styles.vacio}>
          Todavía no hay cargas. La primera que hagas va a aparecer acá.
        </p>
      )}

      {historial?.disponible && historial.cargas.length > 0 && (
        <ul className={styles.cargas}>
          {historial.cargas.map((c) => {
            const deshecha = !!c.deshecha_en
            // Todo lo que trajo ya se descartó o se deshizo por otro lado: no hay nada que deshacer.
            const vacia = !deshecha && c.solicitudes + c.resultados + c.pendientes === 0
            return (
              <li key={c.id} className={`${styles.carga} ${deshecha ? styles.cargaDeshecha : ''}`}>
                <span
                  className={`${styles.tipo} ${c.origen === 'converter' ? styles.tipoPdf : styles.tipoExcel}`}
                >
                  {c.origen === 'converter' ? 'PDF' : 'Excel'}
                </span>
                <div className={styles.cargaInfo}>
                  <span className={styles.cargaArchivo} title={c.archivo ?? undefined}>
                    {c.archivo ||
                      (c.origen === 'converter' ? 'Informes del Converter' : 'Excel de resultados')}
                  </span>
                  <span className={styles.cargaMeta}>
                    {fechaHoraCorta(c.creado_en)}
                    {c.creado_por ? ` · ${c.creado_por}` : ''}
                  </span>
                </div>
                <div className={styles.cifras}>
                  {vacia ? (
                    <span className={styles.cifraDeshecha}>
                      Nada de esta carga quedó en la base
                    </span>
                  ) : deshecha ? (
                    <span className={styles.cifraDeshecha}>
                      Deshecha {fechaHoraCorta(c.deshecha_en)}
                      {c.deshecha_por ? ` por ${c.deshecha_por}` : ''}
                    </span>
                  ) : (
                    <>
                      <span className={styles.cifra}>
                        <strong>{c.solicitudes}</strong>{' '}
                        {c.solicitudes === 1 ? 'informe' : 'informes'}
                      </span>
                      <span className={styles.cifra}>
                        <strong>{c.resultados}</strong>{' '}
                        {c.resultados === 1 ? 'resultado' : 'resultados'}
                      </span>
                      {c.pendientes > 0 && (
                        <span className={`${styles.cifra} ${styles.cifraAlerta}`}>
                          <strong>{c.pendientes}</strong>{' '}
                          {c.pendientes === 1 ? 'pendiente' : 'pendientes'}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!deshecha && !vacia && (
                  <button
                    type="button"
                    className={styles.btnDeshacer}
                    disabled={ocupado !== null}
                    onClick={() => void deshacer(c)}
                  >
                    {ocupado === c.id ? 'Deshaciendo…' : 'Deshacer'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
