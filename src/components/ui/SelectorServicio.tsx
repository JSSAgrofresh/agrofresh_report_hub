import { useId } from 'react'
import { cn } from '@/lib/cn'
import { ETIQUETA_LISTA, SERVICIOS } from '@/lib/servicio'
import type { ListaDistribucion } from '@/lib/servicio'
import styles from './SelectorServicio.module.css'

interface SelectorServicioProps {
  valor: ListaDistribucion
  onChange: (servicio: ListaDistribucion) => void
  /** Qué opciones mostrar (por defecto, los tres servicios; las listas de distribución agregan RYD). */
  opciones?: readonly ListaDistribucion[]
  /** Cuántos registros tiene cada servicio (se muestra al lado del nombre). */
  conteos?: Partial<Record<ListaDistribucion, number | null>>
  /** Texto corto bajo cada opción. */
  detalle?: Partial<Record<ListaDistribucion, string>>
  etiqueta?: string
}

/**
 * Elige entre Línea de proceso, Actimist y Ecofog. Cada servicio lleva siempre el mismo
 * color en toda la app (violeta, azul y verde azulado), para que
 * se sepa de un vistazo en qué lista se está trabajando.
 */
export function SelectorServicio({ valor, onChange, conteos, detalle, opciones = SERVICIOS, etiqueta = 'Tipo de servicio' }: SelectorServicioProps) {
  const idEtiqueta = useId()
  return (
    <div className={styles.contenedor}>
      <span className={styles.etiqueta} id={idEtiqueta}>{etiqueta}</span>
      <div className={styles.opciones} role="radiogroup" aria-labelledby={idEtiqueta}>
        {opciones.map((s) => {
          const activo = valor === s
          const n = conteos?.[s]
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={activo}
              className={cn(styles.opcion, styles[s], activo && styles.activa)}
              onClick={() => onChange(s)}
            >
              <span className={styles.punto} aria-hidden="true" />
              <span className={styles.textos}>
                <span className={styles.nombre}>
                  {ETIQUETA_LISTA[s]}
                  {n != null && <span className={styles.conteo}>{n.toLocaleString('es-CL')}</span>}
                </span>
                {detalle?.[s] && <span className={styles.detalle}>{detalle[s]}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Pastilla con el nombre del servicio, en su color. */
export function EtiquetaServicio({ servicio, className }: { servicio: ListaDistribucion; className?: string }) {
  return (
    <span className={cn(styles.chip, styles[servicio], className)}>
      <span className={styles.punto} aria-hidden="true" />
      {ETIQUETA_LISTA[servicio]}
    </span>
  )
}
