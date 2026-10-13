import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { AreaHero, fondoParaEspecie } from '@/features/dashboard'
import type { Usuario } from '@/features/usuarios'
import { InformesAccutabCliente } from '@/views/modules/reports/InformesAccutabCliente'
import { AccesosCliente } from './AccesosCliente'

export function ClienteDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const config = AREAS[area]
  const cliente = usuario.clienteNombre ?? usuario.nombre
  // Si la cuenta está acotada a una sucursal (Ship To) específica, el
  // encabezado muestra esa sucursal -ej. "Dole Codegua"- en vez del Sold To
  // completo, para que quede claro qué alcance tiene la cuenta.
  const titulo = usuario.plantaNombre ?? cliente
  // Temporada de cereza: el fondo del encabezado es el de cereza. El Report ya NO se incrusta acá (tiene su
  // propia entrada en el menú): el panel de un cliente lo arma el administrador (Panel de inicio).
  const fondoHero = area === 'cromatografia' ? fondoParaEspecie(null, config.fondo) : undefined

  return (
    <div>
      <AreaHero
        area={config}
        titulo={titulo}
        descripcion={`Portal de cliente · ${config.nombre}. Acceso exclusivo a tus datos.`}
        fondo={fondoHero?.imagen}
        tinte={fondoHero?.tinte}
      />

      {area === 'cromatografia' ? (
        <AccesosCliente usuario={usuario} />
      ) : area === 'postventa' ? (
        <InformesAccutabCliente />
      ) : (
        <EstadoModulo
          etiqueta="Próximamente"
          titulo="Tus reportes están en camino"
          descripcion="Cuando esté conectada la base de datos vas a poder ver el detalle de tus muestras, gráficos de resultados y descargar el reporte en Excel. Por ahora este portal solo confirma que tu acceso está configurado correctamente."
        />
      )}
    </div>
  )
}
