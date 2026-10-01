import { INFO_CAMPO, etiquetaCorreo } from '@/features/listasDistribucion'
import type { CampoLista, EstadoPropuesta, Origen } from '@/features/listasDistribucion'
import styles from './TablaListas.module.css'

const MAX_CHIPS = 3

interface Props {
  campo: CampoLista
  guardado: string[]
  mostrado: string[]
  estado?: EstadoPropuesta
  origen?: Origen
  /** correos que la propuesta pasa a la copia correcta */
  ajustar: string[]
  /** correos que hoy están en la copia equivocada */
  copiaMal: string[]
  /** celda que no debería estar vacía (técnico o comercial) */
  critica: boolean
  colSpan?: number
  etiqueta: string
  onEditar: (ancla: DOMRect) => void
  onAceptar?: () => void
  onRechazar?: () => void
}

type Kind = 'nuevo' | 'quitado' | 'ajuste' | 'igual'

/** Una celda de la tabla: lo guardado, o lo propuesto en amarillo / aceptado en verde. */
export function CeldaLista({
  campo, guardado, mostrado, estado, origen, ajustar, copiaMal, critica, colSpan, etiqueta, onEditar, onAceptar, onRechazar,
}: Props) {
  const g = new Set(guardado.map((e) => e.toLowerCase()))
  const m = new Set(mostrado.map((e) => e.toLowerCase()))
  const ajustes = new Set([...ajustar, ...copiaMal].map((e) => e.toLowerCase()))
  const chips: { texto: string; kind: Kind }[] = [
    ...mostrado.filter((e) => !g.has(e.toLowerCase())).map((texto) => ({ texto, kind: 'nuevo' as Kind })),
    ...guardado.filter((e) => !m.has(e.toLowerCase())).map((texto) => ({ texto, kind: 'quitado' as Kind })),
    ...mostrado.filter((e) => g.has(e.toLowerCase()) && ajustes.has(e.toLowerCase())).map((texto) => ({ texto, kind: 'ajuste' as Kind })),
    ...mostrado.filter((e) => g.has(e.toLowerCase()) && !ajustes.has(e.toLowerCase())).map((texto) => ({ texto, kind: 'igual' as Kind })),
  ]
  const visibles = chips.slice(0, MAX_CHIPS)
  const resto = chips.slice(MAX_CHIPS)
  const clase = [styles.celda, estado === 'pendiente' ? styles.pendiente : '', estado === 'aceptada' ? styles.aceptada : ''].filter(Boolean).join(' ')
  const resumen = mostrado.length ? mostrado.join('; ') : 'vacía'

  return (
    <td className={clase} colSpan={colSpan}>
      <button
        type="button"
        className={styles.contenido}
        aria-label={`${etiqueta}: ${resumen}${estado === 'pendiente' ? ' (cambio por revisar)' : estado === 'aceptada' ? ' (cambio aceptado)' : ''}. Editar`}
        title={`${INFO_CAMPO[campo].titulo}${mostrado.length ? `\n${mostrado.join('\n')}` : ''}`}
        onClick={(e) => onEditar(e.currentTarget.getBoundingClientRect())}
      >
        {chips.length === 0 ? (
          <span className={critica ? styles.falta : styles.vacia}>{critica ? '⚠ Falta' : '—'}</span>
        ) : (
          <>
            {visibles.map((c) => (
              <span key={c.kind + c.texto} className={`${styles.chip} ${styles[c.kind]}`}>
                {c.kind === 'nuevo' && <i aria-label="se agrega">+</i>}
                {c.kind === 'quitado' && <i aria-label="se quita">−</i>}
                {c.kind === 'ajuste' && <i aria-label="se corrige la copia">↻</i>}
                <span title={c.texto}>{etiquetaCorreo(c.texto)}</span>
              </span>
            ))}
            {resto.length > 0 && <span className={styles.mas} title={resto.map((c) => c.texto).join('\n')}>+{resto.length} más</span>}
          </>
        )}
      </button>

      {estado === 'pendiente' && onAceptar && onRechazar && (
        <span className={styles.acciones}>
          <button type="button" className={styles.ok} aria-label={`Aceptar el cambio en ${etiqueta}`} title="Aceptar" onClick={onAceptar}>✓</button>
          <button type="button" className={styles.no} aria-label={`Rechazar el cambio en ${etiqueta}`} title="Rechazar" onClick={onRechazar}>✕</button>
        </span>
      )}
      {estado === 'aceptada' && onRechazar && (
        <span className={styles.acciones}>
          <button type="button" className={styles.no} aria-label={`Deshacer el cambio en ${etiqueta}`} title={origen === 'manual' ? 'Deshacer mi cambio' : 'Deshacer'} onClick={onRechazar}>↶</button>
        </span>
      )}
    </td>
  )
}
