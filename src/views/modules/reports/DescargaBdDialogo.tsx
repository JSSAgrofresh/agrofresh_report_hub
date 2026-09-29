import { useEffect } from 'react'
import styles from './DescargaBdDialogo.module.css'

interface DescargaBdDialogoProps {
  /** Filtros puestos, ya en palabras («Laboratorio: ALS»). */
  chips: { etiqueta: string; valor: string }[]
  solicitudesFiltradas: number
  solicitudesTotales: number
  descargando: boolean
  onDescargarFiltrada: () => void
  onLimpiarYDescargarCompleta: () => void
  onCerrar: () => void
}

/** Aviso antes de bajar la BD con filtros puestos: lo que se descarga NO es el
 * total, y se ofrece la salida (limpiar y bajar todo) en el mismo lugar. */
export function DescargaBdDialogo({
  chips,
  solicitudesFiltradas,
  solicitudesTotales,
  descargando,
  onDescargarFiltrada,
  onLimpiarYDescargarCompleta,
  onCerrar,
}: DescargaBdDialogoProps) {
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape' && !descargando) onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [descargando, onCerrar])

  const sinDatos = solicitudesFiltradas === 0

  return (
    <div className={styles.fondo} onMouseDown={(e) => e.target === e.currentTarget && !descargando && onCerrar()}>
      <div className={styles.ventana} role="alertdialog" aria-modal="true" aria-labelledby="descarga-bd-titulo">
        <div className={styles.icono} aria-hidden>
          !
        </div>
        <h2 id="descarga-bd-titulo" className={styles.titulo}>
          Vas a descargar una versión acotada
        </h2>
        <p className={styles.texto}>
          Tienes filtros aplicados, así que el Excel <strong>no traerá el total de los datos</strong>, sino solo{' '}
          <strong>
            {solicitudesFiltradas.toLocaleString('es-CL')} de {solicitudesTotales.toLocaleString('es-CL')} solicitudes
          </strong>{' '}
          y las columnas que les corresponden.
        </p>
        <ul className={styles.chips} aria-label="Filtros aplicados">
          {chips.map((c) => (
            <li key={c.etiqueta} className={styles.chip}>
              <span>{c.etiqueta}</span> {c.valor}
            </li>
          ))}
        </ul>
        <p className={styles.texto}>Si quieres la base completa, limpia los filtros primero.</p>

        <div className={styles.acciones}>
          <button type="button" className={styles.primario} onClick={onLimpiarYDescargarCompleta} disabled={descargando}>
            Limpiar filtros y descargar BD completa
          </button>
          <button type="button" className={styles.secundario} onClick={onDescargarFiltrada} disabled={descargando || sinDatos}>
            {sinDatos ? 'Los filtros no dejan ninguna solicitud' : 'Descargar BD filtrada'}
          </button>
          <button type="button" className={styles.cancelar} onClick={onCerrar} disabled={descargando}>
            Cancelar
          </button>
        </div>
        {descargando && <p className={styles.estado}>Generando el Excel…</p>}
      </div>
    </div>
  )
}
