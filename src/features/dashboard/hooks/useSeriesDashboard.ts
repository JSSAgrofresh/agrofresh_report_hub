import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchSeries } from '../api/seriesApi'
import type { SeriesDashboard } from '../types'

/** Las series de los gráficos cambian despacio: se piden una vez al abrir el panel. */
export function useSeriesDashboard(activo: boolean) {
  const [series, setSeries] = useState<SeriesDashboard | null>(null)
  const [status, setStatus] = useState<AsyncStatus>(activo ? 'loading' : 'idle')

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    fetchSeries()
      .then((data) => {
        if (cancelado) return
        setSeries(data)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelado) setStatus('error')
      })
    return () => { cancelado = true }
  }, [activo])

  return { series, status }
}
