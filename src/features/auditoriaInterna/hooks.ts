import { useCallback, useEffect, useState } from 'react'
import { guardarReglasEntrega, leerHitosEntrega, leerReglasEntrega, listarSolicitudesAuditoria } from './lib/api'
import type { CalidadEntrega, Definicion, Hitos, ReglasEntrega } from './lib/entrega'
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

/** Los hitos de cada solicitud y las reglas (plazos, qué es «entregado») de los
 * indicadores de entrega. Si algo falla, el resto del panel sigue igual. */
export function useEntrega() {
  const [hitos, setHitos] = useState<Map<string, Hitos> | null>(null)
  const [calidad, setCalidad] = useState<CalidadEntrega | null>(null)
  const [reglas, setReglas] = useState<ReglasEntrega | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([leerHitosEntrega(), leerReglasEntrega()])
      .then(([h, r]) => {
        if (cancelado) return
        setHitos(new Map(h.hitos.map((x) => [x.archivo, x])))
        setCalidad(h.calidad)
        setReglas(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudieron leer los indicadores de entrega.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const guardar = useCallback(async (entregado: Definicion, plazos: Record<string, number | null>) => {
    const nuevas = await guardarReglasEntrega(entregado, plazos)
    setReglas(nuevas)
    return nuevas
  }, [])

  return { hitos, calidad, reglas, error, guardar }
}
