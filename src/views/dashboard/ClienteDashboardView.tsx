import { useState } from 'react'
import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { AreaHero, fondoParaEspecie } from '@/features/dashboard'
import type { Usuario } from '@/features/usuarios'
import { ReporteView } from '@/views/modules/reports/ReporteView'

export function ClienteDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const config = AREAS[area]
  const cliente = usuario.clienteNombre ?? usuario.nombre
  // Si la cuenta está acotada a una sucursal (Ship To) específica, el
  // encabezado muestra esa sucursal -ej. "Dole Codegua"- en vez del Sold To
  // completo, para que quede claro qué alcance tiene la cuenta.
  const titulo = usuario.plantaNombre ?? cliente
  // Temporada de cereza: mientras no haya un filtro de especie activo (o la
  // fruta filtrada todavía no tenga foto propia), el fondo del encabezado
  // es el de cereza -se actualiza en vivo según lo que el cliente filtre en Report-.
  const [especieFiltrada, setEspecieFiltrada] = useState<string | null>(null)
  // El velo del encabezado toma el tono de la foto de la fruta -verde en pera,
  // azul en arándano-, no el rojo de marca del área.
  const fondoHero = area === 'cromatografia' ? fondoParaEspecie(especieFiltrada, config.fondo) : undefined

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
        <ReporteView clienteFijo={cliente} plantaFija={usuario.plantaNombre} onCropChange={setEspecieFiltrada} />
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
