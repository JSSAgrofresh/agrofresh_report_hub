import { useCallback, useState } from 'react'
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
} from '../api/usuariosStore'
import type { Usuario } from '../types'

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(() => listarUsuarios())

  const refrescar = useCallback(() => setUsuarios(listarUsuarios()), [])

  const crear = useCallback(
    (datos: Omit<Usuario, 'id'>) => {
      const nuevo = crearUsuario(datos)
      refrescar()
      return nuevo
    },
    [refrescar],
  )

  const actualizar = useCallback(
    (id: string, datos: Partial<Omit<Usuario, 'id'>>) => {
      const actualizado = actualizarUsuario(id, datos)
      refrescar()
      return actualizado
    },
    [refrescar],
  )

  const eliminar = useCallback(
    (id: string) => {
      eliminarUsuario(id)
      refrescar()
    },
    [refrescar],
  )

  return { usuarios, crear, actualizar, eliminar }
}
