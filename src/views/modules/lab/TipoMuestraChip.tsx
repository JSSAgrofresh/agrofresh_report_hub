import { CONFIG_TIPOS_MUESTRA } from '@/features/emitir'
import styles from './TipoMuestraChip.module.css'

interface TipoMuestraChipProps {
  tipo: string | null | undefined
  /** Si es true, muestra solo el código sin descripción adicional */
  compacto?: boolean
}

/**
 * Identifica visualmente el tipo de muestra con un chip de color.
 * Normal → verde base, F-AGF → naranja (sortificado), D-AGF → morado (duplicado).
 * La identificación nunca depende solo del color: siempre muestra el código.
 */
export function TipoMuestraChip({ tipo, compacto = false }: TipoMuestraChipProps) {
  if (!tipo) return null

  const config = CONFIG_TIPOS_MUESTRA[tipo]
  const clase = config ? styles[config.colorVar] ?? styles.normal : styles.normal
  const descripcion = config?.descripcion

  return (
    <span className={`${styles.chip} ${clase}`} title={descripcion ?? tipo}>
      {tipo}
      {!compacto && descripcion && (
        <span className={styles.descripcion}>{descripcion}</span>
      )}
    </span>
  )
}
