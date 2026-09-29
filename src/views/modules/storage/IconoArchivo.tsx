import { tipoDeArchivo } from '@/features/storage'
import { cn } from '@/lib/cn'
import styles from './IconoArchivo.module.css'

interface IconoCarpetaProps {
  grande?: boolean
  restringida?: boolean
  /** Color propio (el del espacio en la raíz). */
  color?: string
  className?: string
}

/** Carpeta ámbar, como la de un explorador de verdad. */
export function IconoCarpeta({ grande, restringida, color, className }: IconoCarpetaProps) {
  return (
    <span className={cn(styles.carpeta, grande && styles.grande, className)} style={color ? ({ '--carpeta': color } as React.CSSProperties) : undefined}>
      <svg viewBox="0 0 32 26" aria-hidden>
        <path className={styles.carpetaAtras} d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7l3 3H27.5A2.5 2.5 0 0 1 30 7.5v14a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" />
        <path className={styles.carpetaFrente} d="M2 10.5A2.5 2.5 0 0 1 4.5 8h23a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" />
      </svg>
      {restringida && (
        <svg className={styles.candado} viewBox="0 0 24 24" aria-hidden>
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" />
        </svg>
      )}
    </span>
  )
}

interface IconoArchivoProps {
  nombre: string
  grande?: boolean
  className?: string
}

/** Hoja de color según el tipo, con la extensión escrita. */
export function IconoArchivo({ nombre, grande, className }: IconoArchivoProps) {
  const tipo = tipoDeArchivo(nombre)
  return (
    <span
      className={cn(styles.archivo, grande && styles.grande, className)}
      style={{ '--tipo': tipo.color } as React.CSSProperties}
      aria-hidden
    >
      <svg viewBox="0 0 26 32">
        <path className={styles.hoja} d="M3 2.5A1.5 1.5 0 0 1 4.5 1H16l7 7v21.5A1.5 1.5 0 0 1 21.5 31h-17A1.5 1.5 0 0 1 3 29.5z" />
        <path className={styles.doblez} d="M16 1v5.5A1.5 1.5 0 0 0 17.5 8H23z" />
      </svg>
      <b className={styles.etiqueta}>{tipo.etiqueta}</b>
    </span>
  )
}
