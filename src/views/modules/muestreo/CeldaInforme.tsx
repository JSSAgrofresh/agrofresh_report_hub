import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudesView.module.css'

/** El N° de informe del laboratorio. Un clic abre el PDF en el visor. Sin
 * informe: «—». Si el informe está en Report pero no hay PDF subido por
 * Converter, igual se puede intentar abrir: el backend lo busca en Storage →
 * Informes y, si no está, el visor lo avisa. */
export function CeldaInforme({ s, onAbrir }: { s: Solicitud; onAbrir: (s: Solicitud) => void }) {
  const inf = s.informe
  if (!inf) return <span className={styles.sinInforme}>—</span>
  const numero = inf.nro_informe ?? 'Ver informe'
  const extra = inf.numeros.length > 1 ? ` +${inf.numeros.length - 1}` : ''
  const titulo = [
    inf.numeros.length > 1 ? `Informes: ${inf.numeros.join(', ')}` : `Informe ${numero}`,
    inf.en_report ? 'Resultados en Report' : 'Resultados todavía no cargados en Report',
    inf.pdf_guardado ? 'Clic para ver el PDF' : 'Clic para buscar el PDF',
  ].join(' · ')
  return (
    <button type="button" className={styles.chipInforme} title={titulo} onClick={() => onAbrir(s)}>
      <span aria-hidden="true">📄</span> {numero}
      {extra}
    </button>
  )
}
