import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudesView.module.css'

/** Enviada / Pendiente y, además, «Sin lista de distribución» cuando los
 * resultados de esta solicitud no tienen a nadie del cliente en Para (para su
 * Sold To, Ship To y especie) y rige la regla de respaldo: solo Jorge y
 * Claudia. Es el aviso de que esa regla se está aplicando. */
export function EstadoSolicitud({ s }: { s: Solicitud }) {
  return (
    <span className={styles.estadosSolicitud}>
      <span className={s.enviada ? styles.chipEnviada : styles.chipPendiente}>
        {s.enviada ? 'Enviada' : 'Pendiente'}
      </span>
      {s.sin_lista_distribucion && (
        <span
          className={styles.chipSinLista}
          title="Este cliente y planta no tienen correos de distribución para esta especie: los resultados van solo a Jorge y Claudia."
        >
          Sin lista de distribución
        </span>
      )}
    </span>
  )
}
