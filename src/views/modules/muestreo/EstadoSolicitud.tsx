import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudesView.module.css'

/** Enviada / Pendiente y, además, «Sin lista de distribución» cuando el
 * laboratorio no tiene a nadie en Para y rige la lista de respaldo (Jorge y
 * Claudia). Es el aviso de que esa regla se está aplicando. */
export function EstadoSolicitud({ s }: { s: Solicitud }) {
  return (
    <span className={styles.estadosSolicitud}>
      <span className={s.enviada ? styles.chipEnviada : styles.chipPendiente}>
        {s.enviada ? 'Enviada' : 'Pendiente'}
      </span>
      {s.sin_lista_distribucion && (
        <span
          className={styles.chipSinLista}
          title={
            s.enviada
              ? 'El laboratorio no tiene lista de distribución: se envió a Jorge y Claudia.'
              : 'El laboratorio no tiene lista de distribución: se enviará a Jorge y Claudia.'
          }
        >
          Sin lista de distribución
        </span>
      )}
    </span>
  )
}
