import { otPorRevisar, type Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudesView.module.css'

/** El N° de informe del laboratorio. Un clic abre el PDF en el visor. Sin
 * informe: «—». Si el informe está en Report pero no hay PDF subido por
 * Converter, igual se puede intentar abrir: el backend lo busca en Storage →
 * Informes y, si no está, el visor lo avisa.
 *
 * Al lado va si la OT está bien cruzada: ✓ cuando el informe trae impresa esa
 * misma OT y calzan planta, especie y fecha de muestreo; «OT por revisar»
 * (rojo) si algo no calza, y «OT sin confirmar» (gris) si el informe ya está en
 * Report pero no trae la OT para comprobarla. */
export function CeldaInforme({ s, onAbrir }: { s: Solicitud; onAbrir: (s: Solicitud) => void }) {
  const inf = s.informe
  if (!inf) return <span className={styles.sinInforme}>{s.enviada ? 'Esperando' : '—'}</span>
  const numero = inf.nro_informe ?? 'Ver informe'
  const extra = inf.numeros.length > 1 ? ` +${inf.numeros.length - 1}` : ''
  const titulo = [
    inf.numeros.length > 1 ? `Informes: ${inf.numeros.join(', ')}` : `Informe ${numero}`,
    inf.en_report ? 'Resultados en Report' : 'Resultados todavía no cargados en Report',
    inf.pdf_guardado ? 'Clic para ver el PDF' : 'Clic para buscar el PDF',
  ].join(' · ')
  const v = inf.verificacion
  const confirmada = v?.estado === 'confirmada'
  const porRevisar = otPorRevisar(s)
  return (
    <span className={styles.informeYAviso}>
      <button type="button" className={styles.chipInforme} title={titulo} onClick={() => onAbrir(s)}>
        <span aria-hidden="true">📄</span> {numero}
        {extra}
        {confirmada && (
          <span className={styles.otConfirmada} title={`El informe dice ${s.numero_solicitud}: OT confirmada`} aria-label="OT confirmada">
            ✓
          </span>
        )}
      </button>
      {porRevisar && v && (
        <span
          className={v.estado === 'revisar' ? styles.chipOtRevisar : styles.chipOtSinConfirmar}
          title={v.motivos.join(' · ')}
        >
          {v.estado === 'revisar' ? 'OT por revisar' : 'OT sin confirmar'}
        </span>
      )}
      {!inf.en_report && (
        <span
          className={styles.chipSinReport}
          title="El PDF del informe se subió, pero sus resultados no están en Report: revisa Ingesta de Datos → Filas pendientes (Sold To / Ship To que no calzó con Listados)."
        >
          Sin Report
        </span>
      )}
    </span>
  )
}
