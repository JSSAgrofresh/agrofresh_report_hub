import type { ComponentType, SVGProps } from 'react'
import {
  IconFrutaManzana,
  IconFrutaPera,
  IconFrutaNaranja,
  IconFrutaLimon,
  IconFrutaCereza,
  IconFrutaCiruela,
} from '@/components/ui/icons'
import styles from './SelectorIconoUsuario.module.css'

const CLAVE_ICONO = 'agrofresh.usuario.icono.v1'

export interface IconoFruta {
  id: string
  color: string
  Icono: ComponentType<SVGProps<SVGSVGElement>>
  etiqueta: string
}

export const ICONOS_FRUTAS: IconoFruta[] = [
  { id: 'manzana', color: '#6E202A', Icono: IconFrutaManzana, etiqueta: 'Manzana' },
  { id: 'pera', color: '#636E20', Icono: IconFrutaPera, etiqueta: 'Pera' },
  { id: 'naranja', color: '#6E3F20', Icono: IconFrutaNaranja, etiqueta: 'Naranja' },
  { id: 'limon', color: '#6E5E20', Icono: IconFrutaLimon, etiqueta: 'Limón' },
  { id: 'cereza', color: '#8B2035', Icono: IconFrutaCereza, etiqueta: 'Cereza' },
  { id: 'ciruela', color: '#37206E', Icono: IconFrutaCiruela, etiqueta: 'Ciruela' },
]

export function leerIconoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_ICONO)
  } catch {
    return null
  }
}

export function guardarIcono(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(CLAVE_ICONO)
    } else {
      localStorage.setItem(CLAVE_ICONO, id)
    }
  } catch {
    // ignore
  }
}

interface SelectorIconoUsuarioProps {
  iconoActual: string | null
  onElegir: (id: string | null) => void
  onCerrar: () => void
}

export function SelectorIconoUsuario({ iconoActual, onElegir, onCerrar }: SelectorIconoUsuarioProps) {
  function elegir(id: string) {
    guardarIcono(id)
    onElegir(id)
    onCerrar()
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Elegir ícono de perfil">
      <p className={styles.titulo}>Ícono de perfil</p>
      <div className={styles.grilla}>
        {ICONOS_FRUTAS.map(({ id, color, Icono, etiqueta }) => {
          const activo = iconoActual === id
          return (
            <button
              key={id}
              type="button"
              className={`${styles.opcion} ${activo ? styles.opcionActiva : ''}`}
              style={{ background: color }}
              aria-label={etiqueta}
              aria-pressed={activo}
              title={etiqueta}
              onClick={() => elegir(id)}
            >
              <Icono className={styles.iconoFruta} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
