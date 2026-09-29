import { ReporteView } from '@/views/modules/reports/ReporteView'

/** La vista por límite de control es un gráfico interno: vive solo acá. Es el
 * mismo componente de Report, con los mismos filtros y gráficos, en su modo de
 * límite de control. */
export function LimiteControlView() {
  return <ReporteView vistaControl />
}
