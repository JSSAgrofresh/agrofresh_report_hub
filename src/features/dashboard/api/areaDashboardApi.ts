import type { AreaId } from '@/constants/areas'
import type { ResumenArea } from '../types'

// Datos de ejemplo por área hasta que exista el backend y la base de datos.
const RESUMEN_POR_AREA: Record<AreaId, ResumenArea> = {
  cromatografia: {
    totalRegistros2026: 486,
    registrosUltimaSemana: 23,
    reportesEnviados: [
      { id: 'rc-1', detalle: 'Quiteca · 4 informes homogenizados', fecha: '11-08-2026' },
      { id: 'rc-2', detalle: 'Diagnofruit · 2 informes homogenizados', fecha: '09-08-2026' },
      { id: 'rc-3', detalle: 'Corthorn/ALS · 6 informes homogenizados', fecha: '07-08-2026' },
    ],
  },
  postcosecha: {
    totalRegistros2026: 1204,
    registrosUltimaSemana: 61,
    reportesEnviados: [
      { id: 'rp-1', detalle: 'Informe pH/ORP · Forma 2', fecha: '10-08-2026' },
      { id: 'rp-2', detalle: 'Informe pH/ORP · Forma 1', fecha: '06-08-2026' },
      { id: 'rp-3', detalle: 'Informe pH/ORP · Forma 3 (Hanna)', fecha: '02-08-2026' },
    ],
  },
}

export async function fetchResumenArea(area: AreaId): Promise<ResumenArea> {
  return RESUMEN_POR_AREA[area]
}
