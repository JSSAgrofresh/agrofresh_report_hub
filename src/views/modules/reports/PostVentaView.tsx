import { Header } from '@/components/layout/Header'
import { EstadoModulo } from '@/components/ui/EstadoModulo'

export function PostVentaView() {
  return (
    <div>
      <Header title="Reportes de Post Venta" description="Seguimiento post venta de los despachos." />
      <EstadoModulo
        etiqueta="En proceso de creación"
        titulo="Todavía no está listo"
        descripcion="Este reporte se está construyendo. Cuando esté listo vas a poder ver acá el seguimiento post venta."
      />
    </div>
  )
}
