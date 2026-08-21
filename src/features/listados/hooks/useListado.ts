import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { TipoListado, ValorLista, ValorListaInput } from '../lib/tipos'

export function useListado(tipo: TipoListado) {
  const [valores, setValores] = useState<ValorLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setValores(await api.listarValores(tipo, { incluirInactivos: true }))
    } catch {
      setError('No se pudo conectar con el backend.')
    } finally {
      setCargando(false)
    }
  }, [tipo])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  const crear = useCallback(
    async (datos: ValorListaInput) => {
      await api.crearValor(tipo, datos)
      await refrescar()
    },
    [tipo, refrescar],
  )

  const editar = useCallback(
    async (id: number, datos: ValorListaInput) => {
      await api.editarValor(tipo, id, datos)
      await refrescar()
    },
    [tipo, refrescar],
  )

  const eliminar = useCallback(
    async (id: number) => {
      await api.eliminarValor(tipo, id)
      await refrescar()
    },
    [tipo, refrescar],
  )

  return { valores, cargando, error, refrescar, crear, editar, eliminar }
}
