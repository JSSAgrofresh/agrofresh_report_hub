import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import styles from './Badge.module.css'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  tone?: BadgeTone
  /** Color hex personalizado (ej. '#3A8A52'). Genera fondo automáticamente con 15% de opacidad. */
  color?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', color, children }: BadgeProps) {
  if (color) {
    const style: CSSProperties = { color, backgroundColor: `${color}26` }
    return <span className={styles.badge} style={style}>{children}</span>
  }
  return <span className={cn(styles.badge, styles[tone])}>{children}</span>
}
