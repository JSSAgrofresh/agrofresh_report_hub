import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { Cliente, ClienteInput, Planta, PlantaInput } from '../lib/tipos'

export function useCatalogo() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, p] = await Promise.all([api.listarClientes(), api.listarPlantas()])
      setClientes(c)
      setPlantas(p)
    } catch {
      setError('No se pudo conectar con el backend.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  const crearCliente = useCallback(
    async (datos: ClienteInput) => {
      await api.crearCliente(datos)
      await refrescar()
    },
    [refrescar],
  )

  const editarCliente = useCallback(
    async (id: number, datos: ClienteInput) => {
      await api.editarCliente(id, datos)
      await refrescar()
    },
    [refrescar],
  )

  const crearPlanta = useCallback(
    async (datos: PlantaInput) => {
      await api.crearPlanta(datos)
      await refrescar()
    },
    [refrescar],
  )

  const editarPlanta = useCallback(
    async (id: number, datos: PlantaInput) => {
      await api.editarPlanta(id, datos)
      await refrescar()
    },
    [refrescar],
  )

  return { clientes, plantas, cargando, error, refrescar, crearCliente, editarCliente, crearPlanta, editarPlanta }
}
