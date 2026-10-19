import type { CSSProperties, ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import styles from './ReporteView.module.css'

/** Tarjeta de indicador: ícono en su pastilla de color, etiqueta, cifra y
 * una línea de contexto. `tono` colorea el ícono y el borde, nunca la cifra
 * -el texto va siempre en los tonos de texto, legible en cualquier caso-. */
export function Kpi({
  icono,
  tono,
  etiqueta,
  destacado,
  children,
  sub,
}: {
  icono: ReactNode
  tono: string
  etiqueta: ReactNode
  destacado?: boolean
  children: ReactNode
  sub?: ReactNode
}) {
  return (
    <Card
      className={`${styles.statCard} ${destacado ? styles.destacado : ''}`}
      style={{ '--kpi': tono } as CSSProperties}
    >
      <div className={styles.kpiCabeza}>
        <span className={styles.kpiIcono} aria-hidden="true">
          {icono}
        </span>
        <span className={styles.statLbl}>{etiqueta}</span>
      </div>
      {children}
      {sub != null && <span className={styles.statSub}>{sub}</span>}
    </Card>
  )
}

