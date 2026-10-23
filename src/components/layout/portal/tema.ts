import { useEffect, useState } from 'react'
import { obtenerVistaReport } from '@/features/reportes/lib/api'

/** Estilos del dashboard de clientes. El predeterminado lo deja el administrador principal en Administración General → Funciones. */
export type TemaPortal = 'basico' | 'sobrio'

export const TEMAS_PORTAL: { id: TemaPortal; nombre: string }[] = [
  { id: 'basico', nombre: 'Básico' },
  { id: 'sobrio', nombre: 'Sobrio' },
]

const CLAVE = 'agrofresh.temaVistaCliente'

export function esTema(v: unknown): v is TemaPortal {
  return v === 'basico' || v === 'sobrio'
}

/** Lo último que eligió quien mira la Vista de cliente (solo en su navegador). */
export function temaGuardado(): TemaPortal | null {
  try {
    const v = localStorage.getItem(CLAVE)
    return esTema(v) ? v : null
  } catch {
    return null
  }
}

export function guardarTema(t: TemaPortal) {
  try {
    localStorage.setItem(CLAVE, t)
  } catch {
    /* sin almacenamiento: vale solo mientras la pantalla esté abierta */
  }
}

/** El estilo del servidor para ESTA cuenta; «clasico» = el marco interno de siempre (solo comerciales). */
export type TemaCuenta = TemaPortal | 'clasico'

const claveCuenta = (id: string | undefined) => `agrofresh.temaCuenta.${id ?? ''}`

function cuentaGuardada(id: string | undefined): TemaCuenta | null {
  try {
    const v = localStorage.getItem(claveCuenta(id))
    return esTema(v) || v === 'clasico' ? v : null
  } catch {
    return null
  }
}

function guardarCuenta(id: string | undefined, t: TemaCuenta) {
  try {
    localStorage.setItem(claveCuenta(id), t)
  } catch {
    /* sin almacenamiento */
  }
}

/** El estilo que el servidor dejó para esta cuenta (su regla, la de su tipo o el predeterminado). `basico` mientras no responda. */
export function useTemaCuenta(userId: string | undefined): TemaCuenta {
  // Parte con el último valor conocido para no repintar el contenido (remonta al cambiar de estilo) en cada visita.
  const [tema, setTema] = useState<TemaCuenta>(() => cuentaGuardada(userId) ?? 'basico')
  useEffect(() => {
    let cancelado = false
    obtenerVistaReport()
      .then((v) => {
        const t = v.tema_cliente
        if (!cancelado && (esTema(t) || t === 'clasico')) {
          setTema(t)
          guardarCuenta(userId, t)
        }
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [userId])
  return tema
}

/** Lo mismo, para el marco del portal: «clasico» (que no lo usa) se ve como Básico. */
export function useTemaPredeterminado(userId?: string): TemaPortal {
  const t = useTemaCuenta(userId)
  return t === 'clasico' ? 'basico' : t
}
