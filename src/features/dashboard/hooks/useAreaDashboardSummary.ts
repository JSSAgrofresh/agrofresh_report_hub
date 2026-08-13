import { useEffect, useState } from 'react'
import type { AreaId } from '@/constants/areas'
import type { AsyncStatus } from '@/types'
import { fetchResumenArea } from '../api/areaDashboardApi'
import type { ResumenArea } from '../types'

export function useAreaDashboardSummary(area: AreaId) {
  const [resumen, setResumen] = useState<ResumenArea | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('loading')

  useEffect(() => {
    let cancelled = false
    fetchResumenArea(area)
      .then((data) => {
        if (cancelled) return
        setResumen(data)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [area])

  return { resumen, status }
}
