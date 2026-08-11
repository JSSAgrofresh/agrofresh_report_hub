import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchReports } from '../api/reportsApi'
import type { Report } from '../types'

export function useReports() {
  const [reports, setReports] = useState<Report[]>([])
  const [status, setStatus] = useState<AsyncStatus>('loading')

  useEffect(() => {
    let cancelled = false

    fetchReports()
      .then((data) => {
        if (cancelled) return
        setReports(data)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { reports, status }
}
