import { describe, expect, it } from 'vitest'
import type { MuestraGC, Solicitud } from '@/features/emitir'
import {
  construirCrucesAutomaticos,
  construirFilasExportables,
  muestrasSinSolicitud,
} from './cruceAutomatico'

const solicitud: Solicitud = {
  archivo: 'OT-0012.xlsx',
  codigo_muestra: 'GCNPD10065',
  fecha_recepcion: '2026-09-01',
  hora_recepcion: '08:12',
  campos: { 'N° Solicitud': 'OT-0012' },
  analitos_solicitados: ['FDL', 'PYR'],
}

const muestra: MuestraGC = {
  codigo: 'gcNPD10065',
  seq_line: 1,
  fecha_inyeccion: '9/1/2026 8:30:00 AM',
  resultados: [
    { analito: 'Fludioxonil', codigo: 'FDL', area: 10, amount: 1 },
    { analito: 'Pyrimethanil', codigo: 'PYR', area: 20, amount: 2 },
  ],
}

describe('cruce automático del GC', () => {
  it('encuentra la solicitud persistida por el mismo código de muestra', () => {
    const [cruce] = construirCrucesAutomaticos([solicitud], [muestra])
    expect(cruce.muestra?.codigo).toBe('gcNPD10065')
    expect(cruce.analitosFaltantes).toEqual([])
  })

  it('construye la fila que consumen el PDF, Excel y la subida a base', () => {
    const cruces = construirCrucesAutomaticos([solicitud], [muestra])
    expect(construirFilasExportables(cruces)).toEqual([
      expect.objectContaining({
        codigo_vial: 'gcNPD10065',
        // La recepción ya no se elige a mano: es la del cruce, que viaja
        // dentro de la solicitud.
        fecha_recepcion: '2026-09-01',
        resultados_por_codigo: { FDL: 1, PYR: 2 },
      }),
    ])
  })

  it('sin cruce guardado no inventa una fecha de recepción', () => {
    const sinRecepcion = { ...solicitud, fecha_recepcion: null, hora_recepcion: null }
    const cruces = construirCrucesAutomaticos([sinRecepcion], [muestra])
    expect(construirFilasExportables(cruces)[0].fecha_recepcion).toBeNull()
  })

  it('separa los viales que todavía no tienen solicitud cruzada', () => {
    const otro = { ...muestra, codigo: 'GCNPD99999' }
    expect(muestrasSinSolicitud([solicitud], [muestra, otro]).map((m) => m.codigo)).toEqual([
      'GCNPD99999',
    ])
  })
})
