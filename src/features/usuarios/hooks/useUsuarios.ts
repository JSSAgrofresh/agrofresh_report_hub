import { useCallback, useEffect, useState } from 'react'
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
} from '../api/usuariosStore'
import type { Usuario } from '../types'

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  const refrescar = useCallback(async () => {
    const lista = await listarUsuarios()
    setUsuarios(lista)
    return lista
  }, [])

  useEffect(() => {
    let vigente = true
    listarUsuarios()
      .then((lista) => {
        if (vigente) setUsuarios(lista)
      })
      .catch(() => {
        if (vigente) setUsuarios([])
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  /** Devuelve la cuenta y su contraseña temporal: quien la crea tiene que
   * dictársela a su dueño, porque no vuelve a mostrarse nunca. */
  const crear = useCallback(
    async (datos: Omit<Usuario, 'id'>) => {
      const creado = await crearUsuario(datos)
      await refrescar()
      return creado
    },
    [refrescar],
  )

  const actualizar = useCallback(
    async (id: string, datos: Omit<Usuario, 'id'>) => {
      const actualizado = await actualizarUsuario(id, datos)
      await refrescar()
      return actualizado
    },
    [refrescar],
  )

  const eliminar = useCallback(
    async (id: string) => {
      await eliminarUsuario(id)
      await refrescar()
    },
    [refrescar],
  )

  return { usuarios, cargando, crear, actualizar, eliminar, refrescar }
}
