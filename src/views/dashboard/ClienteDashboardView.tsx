import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { AreaHero } from '@/features/dashboard'
import type { Usuario } from '@/features/usuarios'

export function ClienteDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const config = AREAS[area]
  const cliente = usuario.clienteNombre ?? usuario.nombre

  return (
    <div>
      <AreaHero
        area={config}
        titulo={cliente}
        descripcion={`Portal de cliente · ${config.nombre}. Acceso exclusivo a tus datos.`}
      />

      <EstadoModulo
        etiqueta="Próximamente"
        titulo="Tus reportes están en camino"
        descripcion="Cuando esté conectada la base de datos vas a poder ver el detalle de tus muestras, gráficos de resultados y descargar el reporte en Excel. Por ahora este portal solo confirma que tu acceso está configurado correctamente."
      />
    </div>
  )
}
