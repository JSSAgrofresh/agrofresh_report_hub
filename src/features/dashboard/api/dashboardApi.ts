import type { ResumenDashboard } from '../types'

// Datos de ejemplo hasta que exista el backend y la base de datos (Audit).
const RESUMEN_MOCK: ResumenDashboard = {
  pendientesRevision: 3,
  ultimasCargas: [
    { id: 'c-1', modulo: 'Converter', detalle: 'solicitudes_11-08-2026.xlsx', fecha: '11-08-2026' },
    { id: 'c-2', modulo: 'Trace', detalle: 'Informe pH/ORP · Forma 2', fecha: '10-08-2026' },
    { id: 'c-3', modulo: 'Converter', detalle: '4 informes homogenizados', fecha: '09-08-2026' },
  ],
  alertas: [
    {
      id: 'a-1',
      modulo: 'Audit',
      mensaje: 'Módulo aún no conectado al backend.',
      severidad: 'info',
    },
  ],
}

export async function fetchResumenDashboard(): Promise<ResumenDashboard> {
  return RESUMEN_MOCK
}
