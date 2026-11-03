import { describe, expect, it } from 'vitest'
import type { FilaDetallePlan } from './api'
import { FILTROS_DETALLE_VACIOS, filtrarDetalle, totalesDetalle, valoresDe } from './detalle'

const fila = (p: Partial<FilaDetallePlan>): FilaDetallePlan => ({
  sold_to: 'DOLE CHILE S.A.', sold_to_sap: '1606562', planta_plan: 'DOLE LONTUE', comercial: 'JC LABARCA', tipo_cliente: 'Estrategico',
  tipo_servicio: 'Costo por Litro', servicio: 'residuales', linea: 1, semana: 'W45', peak: 'Pre peack', original: 1, propuesta: 2, ...p,
})
const FILAS = [
  fila({}),
  fila({ semana: 'W46', original: null, propuesta: 3 }),
  fila({ sold_to: 'GRIN GROUP SPA', sold_to_sap: '10013494', planta_plan: 'GRIN', comercial: 'LUCIANO ALLENDE', servicio: 'fito', tipo_cliente: 'Preferente', original: 4, propuesta: null }),
]

describe('detalle del plan de entregables', () => {
  it('sin filtros trae todo', () => {
    expect(filtrarDetalle(FILAS, FILTROS_DETALLE_VACIOS)).toHaveLength(3)
  })
  it('el texto busca sin tildes ni mayúsculas en Sold To, SAP, planta y comercial', () => {
    expect(filtrarDetalle(FILAS, { ...FILTROS_DETALLE_VACIOS, texto: 'dole' })).toHaveLength(2)
    expect(filtrarDetalle(FILAS, { ...FILTROS_DETALLE_VACIOS, texto: '10013494' })).toHaveLength(1)
    expect(filtrarDetalle(FILAS, { ...FILTROS_DETALLE_VACIOS, texto: 'allende' })).toHaveLength(1)
  })
  it('los filtros se combinan', () => {
    expect(filtrarDetalle(FILAS, { ...FILTROS_DETALLE_VACIOS, comercial: 'JC LABARCA', semana: 'W46' })).toHaveLength(1)
    expect(filtrarDetalle(FILAS, { ...FILTROS_DETALLE_VACIOS, servicio: 'fito', tipoCliente: 'Estrategico' })).toHaveLength(0)
  })
  it('los totales cuentan lo vacío como cero y separan por servicio', () => {
    const t = totalesDetalle(FILAS)
    expect(t).toMatchObject({ filas: 3, soldTo: 2, plantas: 2, original: 5, propuesta: 5 })
    expect(t.porServicio.residuales).toEqual({ original: 1, propuesta: 5 })
    expect(t.porServicio.fito).toEqual({ original: 4, propuesta: 0 })
  })
  it('los valores de una columna salen sin repetir ni vacíos', () => {
    expect(valoresDe(FILAS, 'semana')).toEqual(['W45', 'W46'])
    expect(valoresDe([fila({ comercial: null })], 'comercial')).toEqual([])
  })
})
