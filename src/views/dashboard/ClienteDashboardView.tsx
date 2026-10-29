import { AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { vistaDeCliente } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import { InformesAccutabCliente } from '@/views/modules/reports/InformesAccutabCliente'
import { AccesosCliente } from './AccesosCliente'
import { PortalHero } from './PortalHero'

/** Un cliente no pertenece a un área: ve lo que el administrador le asignó (Report, Storage y/o informes Accu-Tab).
 * `area` ya no se dibuja (el encabezado no lleva el nombre del área). */
export function ClienteDashboardView({ usuario }: { area: AreaId; usuario: Usuario }) {
  const ve = vistaDeCliente(usuario)
  const cliente = usuario.clienteNombre ?? usuario.nombre
  // Si la cuenta está acotada a una sucursal (Ship To) específica, el
  // encabezado muestra esa sucursal -ej. "Dole Codegua"- en vez del Sold To
  // completo, para que quede claro qué alcance tiene la cuenta.
  const titulo = usuario.plantaNombre ?? cliente
  return (
    <div>
      <PortalHero
        titulo={titulo}
        descripcion={
          usuario.tipoAcceso === 'comercial'
            ? 'Comercial. Solo lectura de las plantas que tienes asignadas.'
            : 'Portal de cliente. Acceso exclusivo a tus datos.'
        }
        // Quien ve Accu-Tab lleva la foto de agua de Accu-Tab en el encabezado, como Report lleva la de la especie.
        fondo={ve.accutab ? AREAS.postventa.fondo : undefined}
      />

      {(ve.report || ve.storage) && <AccesosCliente usuario={usuario} />}
      {ve.accutab && <InformesAccutabCliente />}
      {!ve.report && !ve.storage && !ve.accutab && (
        <EstadoModulo
          etiqueta="Próximamente"
          titulo="Tus reportes están en camino"
          descripcion="Cuando esté conectada la base de datos vas a poder ver el detalle de tus muestras, gráficos de resultados y descargar el reporte en Excel. Por ahora este portal solo confirma que tu acceso está configurado correctamente."
        />
      )}
    </div>
  )
}
