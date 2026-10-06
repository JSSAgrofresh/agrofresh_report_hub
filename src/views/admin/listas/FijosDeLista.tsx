import { etiquetaCorreo } from '@/features/listasDistribucion'
import type { FijosLista } from '@/features/listasDistribucion'
import { ETIQUETA_LISTA } from '@/lib/servicio'
import type { ListaDistribucion } from '@/lib/servicio'
import styles from './FijosDeLista.module.css'

function Correos({ lista }: { lista: string[] }) {
  return (
    <>
      {lista.map((e) => <code key={e} title={e}>{etiquetaCorreo(e)}</code>)}
    </>
  )
}

/** Lo que recibe cada solicitud de esta lista, tenga o no plantas cargadas. */
export function FijosDeLista({ fijos, servicio }: { fijos: FijosLista; servicio: ListaDistribucion }) {
  const siempre = fijos.para.length > 0
  return (
    <section className={styles.caja} aria-label={`Destinatarios de ${ETIQUETA_LISTA[servicio]}`}>
      <h3>{siempre ? `Siempre reciben (${ETIQUETA_LISTA[servicio]})` : `Sin lista del cliente (${ETIQUETA_LISTA[servicio]})`}</h3>
      {siempre ? (
        <p>
          <b>Para</b> <Correos lista={fijos.para} /> · <b>Copia</b> <Correos lista={fijos.cc} />
          <span className={styles.nota}>Tenga o no la planta lista cargada; si la tiene, sus correos se suman.</span>
        </p>
      ) : (
        <p>
          Si una planta no tiene lista del cliente, los resultados van <b>Para</b> <Correos lista={fijos.respaldo} />
          {' '}(más los admin del Report Hub).
        </p>
      )}
    </section>
  )
}
