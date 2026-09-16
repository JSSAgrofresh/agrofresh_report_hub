import { useCallback, useEffect, useRef, useState } from 'react'
import { notificacionesApi } from '../api/notificacionesApi'
import type { Notificacion } from '../types'

export function useNotificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState<Notificacion | null>(null)
  // null = carga inicial pendiente; número = último count conocido
  const prevIdsRef = useRef<Set<number> | null>(null)

  useEffect(() => {
    let activo = true
    notificacionesApi
      .listar()
      .then((data) => {
        if (!activo) return
        setNotificaciones(data)
        setCargando(false)
        // Primera carga: registrar IDs sin mostrar toast
        if (prevIdsRef.current === null) {
          prevIdsRef.current = new Set(data.map((n) => n.id))
          return
        }
        // Cargas siguientes: mostrar toast si llegó algo nuevo
        const nuevas = data.filter((n) => !prevIdsRef.current!.has(n.id) && !n.leida)
        if (nuevas.length > 0) setToast(nuevas[0])
        prevIdsRef.current = new Set(data.map((n) => n.id))
      })
      .catch(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [tick])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  const noLeidas = notificaciones.filter((n) => !n.leida).length

  const marcarLeida = useCallback((id: number) => {
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    notificacionesApi.marcarLeida(id).catch(() => {})
  }, [])

  const marcarTodasLeidas = useCallback(() => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    notificacionesApi.marcarTodas().catch(() => {})
  }, [])

  const refrescar = useCallback(() => setTick((n) => n + 1), [])
  const limpiarToast = useCallback(() => setToast(null), [])

  return { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas, refrescar, toast, limpiarToast }
}
