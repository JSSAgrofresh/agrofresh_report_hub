import { useCallback, useEffect, useState } from 'react'
import { notificacionesApi } from '../api/notificacionesApi'
import type { Notificacion } from '../types'

export function useNotificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let activo = true
    notificacionesApi
      .listar()
      .then((data) => {
        if (activo) { setNotificaciones(data); setCargando(false) }
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

  return { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas, refrescar }
}
