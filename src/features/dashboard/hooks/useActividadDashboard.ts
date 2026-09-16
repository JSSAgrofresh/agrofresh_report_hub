import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchActividad } from '../api/actividadApi'
import type { ActividadDashboard } from '../types'

const INTERVALO_MS = 30_000

export function useActividadDashboard() {
  const [actividad, setActividad] = useState<ActividadDashboard | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('loading')
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  // Contador que sube cada vez que el usuario pide refrescar manualmente.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelado = false
    fetchActividad()
      .then((data) => {
        if (cancelado) return
        setActividad(data)
        setStatus('success')
        setUltimaActualizacion(new Date())
      })
      .catch(() => {
        if (!cancelado) setStatus('error')
      })
    return () => { cancelado = true }
  }, [tick])

  // Auto-refresh cada 30 segundos.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), INTERVALO_MS)
    return () => clearInterval(timer)
  }, [])

  const refrescar = () => setTick((t) => t + 1)

  return { actividad, status, ultimaActualizacion, refrescar }
}
