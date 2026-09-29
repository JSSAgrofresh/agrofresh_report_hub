import { useCallback, useRef, useState } from 'react'

export interface Aviso {
  id: number
  tipo: 'ok' | 'error'
  texto: string
}

/** Avisos que aparecen un momento en una esquina y se van solos. */
export function useAvisos(duracionMs = 4500) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(1)

  const quitar = useCallback((id: number) => {
    setAvisos((a) => a.filter((x) => x.id !== id))
  }, [])

  const avisar = useCallback(
    (tipo: Aviso['tipo'], texto: string) => {
      const id = siguiente.current++
      setAvisos((a) => [...a.slice(-3), { id, tipo, texto }])
      window.setTimeout(() => quitar(id), tipo === 'error' ? duracionMs * 1.6 : duracionMs)
    },
    [duracionMs, quitar],
  )

  return { avisos, avisar, quitar }
}
