import { useState } from 'react'
import { AREAS } from '@/constants/areas'
import { useAuth } from '@/features/auth'
import { AreaHero, fondoParaEspecie } from '@/features/dashboard'
import { ReporteView } from './ReporteView'

/** Report de laboratorio para admin: el mismo encabezado con foto que ve el
 * cliente en su portal, para que el admin vea el reporte tal cual lo ven
 * ellos. La foto y su degradado siguen a la especie filtrada, y el título al
 * Sold To elegido. */
export function ReporteLaboratorioView() {
  const { user } = useAuth()
  const config = AREAS.cromatografia
  const [especie, setEspecie] = useState('')
  const [cliente, setCliente] = useState('')
  const fondo = fondoParaEspecie(especie, config.fondo)

  // Una cuenta de cliente entra por esta misma ruta: su encabezado lleva SU sucursal (o su Sold To) y los filtros de
  // Sold To / Ship To no salen, porque sus datos ya vienen acotados desde el servidor.
  if (user?.tipoAcceso === 'cliente') {
    const soldTo = user.clienteNombre ?? user.nombre
    return (
      <div>
        <AreaHero
          area={config}
          titulo={user.plantaNombre ?? soldTo}
          descripcion={`Portal de cliente · ${config.nombre}. Acceso exclusivo a tus datos.`}
          fondo={fondo.imagen}
          tinte={fondo.tinte}
        />
        <ReporteView clienteFijo={soldTo} plantaFija={user.plantaNombre} onCropChange={setEspecie} />
      </div>
    )
  }

  // Un comercial entra por la misma ruta: el servidor ya le deja solo los datos de sus plantas (solo lectura).
  if (user?.tipoAcceso === 'comercial') {
    return (
      <div>
        <AreaHero
          area={config}
          titulo={cliente || 'Tus plantas'}
          descripcion={`Comercial · ${config.nombre}. Resultados de las plantas que tienes asignadas, solo lectura.`}
          fondo={fondo.imagen}
          tinte={fondo.tinte}
        />
        <ReporteView onCropChange={setEspecie} onClienteChange={setCliente} />
      </div>
    )
  }

  return (
    <div>
      <AreaHero
        area={config}
        titulo={cliente || 'Todos los clientes'}
        descripcion={
          cliente
            ? `Vista de administración · ${config.nombre}. Así ve este cliente su reporte.`
            : `Vista de administración · ${config.nombre}. Control de residuos de todos los clientes y sucursales.`
        }
        fondo={fondo.imagen}
        tinte={fondo.tinte}
      />
      <ReporteView onCropChange={setEspecie} onClienteChange={setCliente} />
    </div>
  )
}
