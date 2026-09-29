import { useCallback, useEffect, useState } from 'react'
import { listarSolicitudesAuditoria } from './lib/api'
import type { SolicitudAuditoria } from './lib/tipos'

/** El panel de solicitudes, con recarga manual. Mientras recarga conserva lo
 * que ya tenía (`cargando` avisa): la pantalla no salta ni se vacía. */
export function useSolicitudesAuditoria() {
  const [datos, setDatos] = useState<SolicitudAuditoria[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarSolicitudesAuditoria()
      .then((s) => {
        if (cancelado) return
        setDatos(s)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [recarga])

  const refrescar = useCallback(() => {
    setCargando(true)
    setRecarga((n) => n + 1)
  }, [])

  return { datos, setDatos, error, cargando, refrescar }
}
