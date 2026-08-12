import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import styles from './Skeleton.module.css'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn(styles.skeleton, className)} style={style} />
}
