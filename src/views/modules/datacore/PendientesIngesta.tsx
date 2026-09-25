import { useCallback, useEffect, useState } from 'react'
import {
  descartarLotePendientes,
  descartarPendiente,
  listarPendientes,
  reintentarPendientes,
} from '@/features/ingest'
import type { Pendiente } from '@/features/ingest'
import styles from './PendientesIngesta.module.css'

/** Cuántas se muestran de una vez: son filas para revisar a ojo, no un listado masivo. */
const TAMANO = 200

/** La misma columna se llama distinto según de dónde vino la fila
 * (Ingesta de Datos, Converter, Excel antiguo). */
const COLUMNAS: [string, string[]][] = [
  ['N° Informe', ['N° Informe', 'Informe']],
  ['Sold To', ['Sold To', 'SOLD TO']],
  ['Ship To', ['Ship To', 'SHIP TO']],
  ['Especie', ['Especie', 'CROP']],
  ['Variedad', ['Variedad']],
]

function valor(fila: Record<string, unknown>, nombres: string[]): string {
  for (const n of nombres) {
    const v = fila[n]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v)
  }
  return '—'
}

function motivo(p: Pendiente): string {
  if (!p.motivos.length) return 'Sin motivo registrado'
  return p.motivos
    .map((m) =>
      m.campo === 'nro_solicitud'
        ? 'Sin N° Informe'
        : `${m.etiqueta} «${m.valor}» no está en Listados`,
    )
    .join(' · ')
}

/**
 * Las filas que una carga (Ingesta de Datos o Converter) no pudo meter a la
 * base porque algo no calzó con Listados. Se ven y se resuelven acá, sin tener
 * que subir un archivo: antes solo se podía por consola, y mientras hubiera
 * una sola, el Converter no dejaba cargar.
 */
export function PendientesIngesta() {
  const [filas, setFilas] = useState<Pendiente[] | null>(null)
  const [total, setTotal] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await listarPendientes(1, TAMANO)
      setFilas(r.filas)
      setTotal(r.total)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las filas pendientes.')
    }
  }, [])

  useEffect(() => {
    let vigente = true
    listarPendientes(1, TAMANO)
      .then((r) => {
        if (!vigente) return
        setFilas(r.filas)
        setTotal(r.total)
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(e instanceof Error ? e.message : 'No se pudieron leer las filas pendientes.')
      })
    return () => {
      vigente = false
    }
  }, [])

  async function accion(fn: () => Promise<string>) {
    setOcupado(true)
    setMensaje(null)
    try {
      setMensaje(await fn())
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  const reintentar = () =>
    accion(async () => {
      const r = await reintentarPendientes()
      const quedan = r.reintentados - r.resueltos
      return (
        `${r.resueltos} fila(s) entraron a la base.` +
        (quedan ? ` ${quedan} siguen sin calzar con Listados.` : '')
      )
    })

  const descartarTodas = () => {
    if (
      !window.confirm(
        `Se descartarán las ${total} fila(s) pendientes. No entran a la base y no se pueden recuperar.`,
      )
    )
      return
    void accion(async () => `${(await descartarLotePendientes()).descartados} fila(s) descartadas.`)
  }

  const descartarUna = (p: Pendiente) =>
    accion(async () => {
      await descartarPendiente(p.id)
      return 'Fila descartada.'
    })

  if (error && filas === null) return <p className={styles.error}>{error}</p>
  if (filas === null) return null

  return (
    <section className={styles.root} aria-labelledby="pendientes-titulo">
      <div className={styles.cabecera}>
        <h2 id="pendientes-titulo" className={styles.titulo}>
          Filas pendientes {total > 0 && <span className={styles.contador}>{total}</span>}
        </h2>
        {total > 0 && (
          <div className={styles.acciones}>
            <button
              type="button"
              className={styles.btn}
              disabled={ocupado}
              onClick={() => void reintentar()}
            >
              Reintentar todas
            </button>
            <button
              type="button"
              className={styles.btnPeligro}
              disabled={ocupado}
              onClick={descartarTodas}
            >
              Descartar todas
            </button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <p className={styles.nota}>No hay filas pendientes: todo lo cargado entró a la base.</p>
      ) : (
        <p className={styles.nota}>
          No entraron a la base porque algo no calza con Listados. Corrige Listados y usa
          «Reintentar todas», o descártalas.
        </p>
      )}
      {mensaje && <p className={styles.ok}>{mensaje}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {total > 0 && (
        <div className={styles.tablaCaja}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                {COLUMNAS.map(([titulo]) => (
                  <th key={titulo}>{titulo}</th>
                ))}
                <th>Motivo</th>
                <th>Origen</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id}>
                  {COLUMNAS.map(([titulo, nombres]) => (
                    <td key={titulo}>{valor(p.fila, nombres)}</td>
                  ))}
                  <td className={styles.motivo}>{motivo(p)}</td>
                  <td>{p.origen === 'converter' ? 'Converter' : 'Ingesta'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnChico}
                      disabled={ocupado}
                      onClick={() => void descartarUna(p)}
                    >
                      Descartar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > filas.length && (
        <p className={styles.nota}>
          Se muestran {filas.length} de {total}. Las acciones «todas» sí aplican a las {total}.
        </p>
      )}
    </section>
  )
}
