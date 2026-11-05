import { barras128, limpiarTexto } from '@/features/inventarioLab'
import styles from './Inventario.module.css'

/** La etiqueta del frasco con su código de barras (Code 128). Cada vez que cambia `disparo` un rayo la cruza,
 * como cuando se pistolea. Sin movimiento si la persona prefiere menos animación. */
export function EtiquetaCodigo({ codigo, disparo }: { codigo: string; disparo: number }) {
  const limpio = limpiarTexto(codigo.trim())
  const { rects, ancho } = barras128(limpio || '—')
  return (
    <div className={styles.etiqueta} aria-label={`Etiqueta ${limpio || 'sin código'}`}>
      <svg viewBox={`0 0 ${ancho} 60`} preserveAspectRatio="none" role="img" aria-hidden="true">
        {rects.map((r) => <rect key={r.x} x={r.x} y={0} width={r.w} height={60} fill="#111" />)}
      </svg>
      <div className={styles.etiquetaTexto}>{limpio || '—'}</div>
      <span key={disparo} className={`${styles.laser} ${disparo > 0 ? styles.laserOn : ''}`} aria-hidden="true" />
    </div>
  )
}
