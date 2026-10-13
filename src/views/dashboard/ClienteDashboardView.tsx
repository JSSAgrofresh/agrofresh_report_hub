import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { AreaHero, fondoParaEspecie } from '@/features/dashboard'
import { vistaDeCliente } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import { InformesAccutabCliente } from '@/views/modules/reports/InformesAccutabCliente'
import { AccesosCliente } from './AccesosCliente'

/** Un cliente no pertenece a un área: ve lo que el administrador le asignó (Report, Storage y/o informes Accu-Tab).
 * `area` solo da el encabezado y los colores. */
export function ClienteDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const ve = vistaDeCliente(usuario)
  const config = AREAS[area]
  const cliente = usuario.clienteNombre ?? usuario.nombre
  // Si la cuenta está acotada a una sucursal (Ship To) específica, el
  // encabezado muestra esa sucursal -ej. "Dole Codegua"- en vez del Sold To
  // completo, para que quede claro qué alcance tiene la cuenta.
  const titulo = usuario.plantaNombre ?? cliente
  // Temporada de cereza: el fondo del encabezado es el de cereza. El Report ya NO se incrusta acá (tiene su
  // propia entrada en el menú): el panel de un cliente lo arma el administrador (Panel de inicio).
  const fondoHero = ve.report || area === 'cromatografia' ? fondoParaEspecie(null, config.fondo) : undefined

  return (
    <div>
      <AreaHero
        area={config}
        titulo={titulo}
        descripcion={`Portal de cliente · ${config.nombre}. Acceso exclusivo a tus datos.`}
        fondo={fondoHero?.imagen}
        tinte={fondoHero?.tinte}
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
