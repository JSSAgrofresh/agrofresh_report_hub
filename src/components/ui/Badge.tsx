import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import styles from './Badge.module.css'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return <span className={cn(styles.badge, styles[tone])}>{children}</span>
}
