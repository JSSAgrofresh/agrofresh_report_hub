import type { AreaId } from '@/constants/areas'
import { obtenerResumenReporte } from '@/features/reportes'
import type { ResumenArea } from '../types'

// Postcosecha (Trace) todavía no tiene un backend real conectado — se deja como
// ejemplo hasta que exista. Cromatografía sí (Ingest → Report), así que su
// resumen se trae de la base real más abajo.
const REPORTES_ENVIADOS_EJEMPLO: Record<AreaId, ResumenArea['reportesEnviados']> = {
  cromatografia: [
    { id: 'rc-1', detalle: 'Quiteca · 4 informes homogenizados', fecha: '11-08-2026' },
    { id: 'rc-2', detalle: 'Diagnofruit · 2 informes homogenizados', fecha: '09-08-2026' },
    { id: 'rc-3', detalle: 'Corthorn/ALS · 6 informes homogenizados', fecha: '07-08-2026' },
  ],
  postcosecha: [
    { id: 'rp-1', detalle: 'Informe pH/ORP · Forma 2', fecha: '10-08-2026' },
    { id: 'rp-2', detalle: 'Informe pH/ORP · Forma 1', fecha: '06-08-2026' },
    { id: 'rp-3', detalle: 'Informe pH/ORP · Forma 3 (Hanna)', fecha: '02-08-2026' },
  ],
}

const RESUMEN_POSTCOSECHA_EJEMPLO: ResumenArea = {
  totalRegistros2026: 1204,
  registrosUltimaSemana: 61,
  reportesEnviados: REPORTES_ENVIADOS_EJEMPLO.postcosecha,
}

export async function fetchResumenArea(area: AreaId): Promise<ResumenArea> {
  if (area === 'postcosecha') return RESUMEN_POSTCOSECHA_EJEMPLO

  // Mismos números que "Total de registros" y la cuenta de la última semana en
  // Report: misma fuente (la base real), así que no pueden quedar desincronizados.
  const resumen = await obtenerResumenReporte()
  return {
    totalRegistros2026: resumen.total_solicitudes,
    registrosUltimaSemana: resumen.registros_ultima_semana,
    reportesEnviados: REPORTES_ENVIADOS_EJEMPLO.cromatografia,
  }
}
