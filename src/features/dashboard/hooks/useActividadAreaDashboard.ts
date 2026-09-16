import { useEffect, useState } from 'react'
import type { AreaId } from '@/constants/areas'
import type { AsyncStatus } from '@/types'
import { fetchActividadArea } from '../api/actividadAreaApi'
import type { ActividadArea } from '../types'

const INTERVALO_MS = 30_000

export function useActividadAreaDashboard(area: AreaId) {
  const [actividad, setActividad] = useState<ActividadArea | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('loading')
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelado = false
    fetchActividadArea(area)
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
  }, [area, tick])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), INTERVALO_MS)
    return () => clearInterval(timer)
  }, [])

  const refrescar = () => setTick((t) => t + 1)

  return { actividad, status, ultimaActualizacion, refrescar }
}
