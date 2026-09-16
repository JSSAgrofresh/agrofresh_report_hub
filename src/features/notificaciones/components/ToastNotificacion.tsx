import { useEffect, useState } from 'react'
import type { Notificacion } from '../types'
import styles from './ToastNotificacion.module.css'

interface Props {
  notif: Notificacion
  onCerrar: () => void
}

export function ToastNotificacion({ notif, onCerrar }: Props) {
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    const salida = setTimeout(() => setSaliendo(true), 4600)
    const cierre = setTimeout(() => onCerrar(), 5200)
    return () => { clearTimeout(salida); clearTimeout(cierre) }
  }, [onCerrar])

  return (
    <div
      className={`${styles.toast} ${saliendo ? styles.saliendo : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.icono}>🔔</div>
      <div className={styles.contenido}>
        <p className={styles.titulo}>{notif.titulo}</p>
        <p className={styles.resumen}>{notif.resumen}</p>
      </div>
      <button
        type="button"
        className={styles.cerrar}
        onClick={() => { setSaliendo(true); setTimeout(onCerrar, 300) }}
        aria-label="Cerrar notificación"
      >
        ✕
      </button>
    </div>
  )
}
