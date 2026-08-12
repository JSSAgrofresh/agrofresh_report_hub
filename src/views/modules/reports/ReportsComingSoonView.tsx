import { Header } from '@/components/layout/Header'
import { EstadoModulo } from '@/components/ui/EstadoModulo'

export function ReportsComingSoonView() {
  return (
    <div>
      <Header title="Report" description="Reportes consolidados de la operación." />
      <EstadoModulo
        etiqueta="Próximamente"
        titulo="Report está en construcción"
        descripcion="Este módulo va a reunir los reportes consolidados de Audit, Trace y Converter en un solo lugar. Todavía no existe, pero ya tiene su espacio reservado en el shell."
      />
    </div>
  )
}
