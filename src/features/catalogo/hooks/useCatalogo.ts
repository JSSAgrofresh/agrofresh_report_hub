import { useCallback, useEffect, useState } from 'react'
import { HttpError } from '@/services/http/client'
import type { Servicio } from '@/lib/servicio'
import * as api from '../lib/api'
import type { Cliente, ClienteInput, Planta, PlantaInput } from '../lib/tipos'

/** El listado de Sold To / Ship To de un servicio (por defecto, Línea de proceso). */
export function useCatalogo(servicio: Servicio = 'linea') {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, p] = await Promise.all([api.listarClientes(servicio), api.listarPlantas(servicio)])
      setClientes(c)
      setPlantas(p)
    } catch (e) {
      setClientes([])
      setPlantas([])
      setError(mensajeCatalogo(e, servicio))
    } finally {
      setCargando(false)
    }
  }, [servicio])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  const crearCliente = useCallback(
    async (datos: ClienteInput) => {
      await api.crearCliente(datos, servicio)
      await refrescar()
    },
    [refrescar, servicio],
  )

  const editarCliente = useCallback(
    async (id: number, datos: ClienteInput) => {
      await api.editarCliente(id, datos, servicio)
      await refrescar()
    },
    [refrescar, servicio],
  )

  const crearPlanta = useCallback(
    async (datos: PlantaInput) => {
      await api.crearPlanta(datos, servicio)
      await refrescar()
    },
    [refrescar, servicio],
  )

  const editarPlanta = useCallback(
    async (id: number, datos: PlantaInput) => {
      await api.editarPlanta(id, datos, servicio)
      await refrescar()
    },
    [refrescar, servicio],
  )

  return { clientes, plantas, cargando, error, refrescar, crearCliente, editarCliente, crearPlanta, editarPlanta }
}

/** Mensaje claro cuando el listado no se puede leer. Para Actimist distingue
 * el backend viejo (404: todavía no conoce el listado) y la migración sin
 * correr (503), que son los dos casos esperables al publicar. */
export function mensajeCatalogo(e: unknown, servicio: Servicio): string {
  if (servicio === 'actimist' && e instanceof HttpError) {
    if (e.status === 404) return 'El servidor todavía no tiene el listado de Actimist: falta actualizar y reiniciar el backend.'
    if (e.status === 503) return e.message || 'Falta correr la migración 0049 en el servidor para usar el listado de Actimist.'
  }
  return 'No se pudo conectar con el backend.'
}
