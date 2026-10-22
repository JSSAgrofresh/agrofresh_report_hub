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

/** El estilo que el servidor tiene como predeterminado para los clientes (`basico` mientras no responda). */
export function useTemaPredeterminado(): TemaPortal {
  const [tema, setTema] = useState<TemaPortal>('basico')
  useEffect(() => {
    let cancelado = false
    obtenerVistaReport()
      .then((v) => {
        if (!cancelado && esTema(v.tema_cliente)) setTema(v.tema_cliente)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [])
  return tema
}
