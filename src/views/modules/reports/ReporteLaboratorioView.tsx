import { useState } from 'react'
import { AREAS } from '@/constants/areas'
import { AreaHero, fondoParaEspecie } from '@/features/dashboard'
import { ReporteView } from './ReporteView'

/** Report de laboratorio para admin: el mismo encabezado con foto que ve el
 * cliente en su portal, para que el admin vea el reporte tal cual lo ven
 * ellos. La foto y su degradado siguen a la especie filtrada, y el título al
 * Sold To elegido. */
export function ReporteLaboratorioView() {
  const config = AREAS.cromatografia
  const [especie, setEspecie] = useState('')
  const [cliente, setCliente] = useState('')
  const fondo = fondoParaEspecie(especie, config.fondo)

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
