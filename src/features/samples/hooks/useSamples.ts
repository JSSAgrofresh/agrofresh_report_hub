import { useEffect, useState } from 'react'
import type { AsyncStatus } from '@/types'
import { fetchSamples } from '../api/samplesApi'
import type { Sample } from '../types'

export function useSamples() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [status, setStatus] = useState<AsyncStatus>('loading')

  useEffect(() => {
    let cancelled = false

    fetchSamples()
      .then((data) => {
        if (cancelled) return
        setSamples(data)
        setStatus('success')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { samples, status }
}
