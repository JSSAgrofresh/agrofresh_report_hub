import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { TipoListado, ValorLista, ValorListaInput } from '../lib/tipos'

/** especieId solo aplica a tipo='variedad': mientras no haya una especie
 * elegida no se trae nada -evita listar "todas las variedades de todas las
 * especies" mezcladas, que es justo lo que se quiere evitar-. */
export function useListado(tipo: TipoListado, especieId?: number | null) {
  const [valores, setValores] = useState<ValorLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    if (tipo === 'variedad' && !especieId) {
      setValores([])
      setCargando(false)
      setError(null)
      return
    }
    setCargando(true)
    setError(null)
    try {
      setValores(await api.listarValores(tipo, { incluirInactivos: true, especieId: especieId ?? undefined }))
    } catch {
      setError('No se pudo conectar con el backend.')
    } finally {
      setCargando(false)
    }
  }, [tipo, especieId])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  const crear = useCallback(
    async (datos: ValorListaInput) => {
      await api.crearValor(tipo, { ...datos, especie_id: especieId ?? null })
      await refrescar()
    },
    [tipo, especieId, refrescar],
  )

  const editar = useCallback(
    async (id: number, datos: ValorListaInput) => {
      await api.editarValor(tipo, id, { ...datos, especie_id: especieId ?? null })
      await refrescar()
    },
    [tipo, especieId, refrescar],
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
