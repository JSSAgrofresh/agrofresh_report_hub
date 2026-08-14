import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchResumenDashboard } from '../api/dashboardApi'
import type { ResumenDashboard } from '../types'

export function useDashboardSummary() {
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('loading')

  useEffect(() => {
    let cancelled = false
    fetchResumenDashboard()
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
  }, [])

  return { resumen, status }
}
