import { describe, expect, it } from 'vitest'
import type { ResumenLaboratorio } from './api'
import { ordenarLaboratorios, porcentajeConErrores } from './formato'

const lab = (laboratorio: string, altos: number, con: number, rev = 10): ResumenLaboratorio => ({
  laboratorio, solicitudes_revisadas: 0,
  informes_revisados: rev, informes_con_problema: con, solicitudes_con_problema: 0, altos, medios: 0, por_codigo: {},
})

describe('integridad: formato', () => {
  it('el porcentaje con errores se redondea y no divide por cero', () => {
    expect(porcentajeConErrores(lab('A', 0, 3, 8))).toBe(38)
    expect(porcentajeConErrores(lab('A', 0, 0, 0))).toBe(0)
  })
  it('ordena primero al laboratorio con más errores graves', () => {
    const r = ordenarLaboratorios([lab('ALS', 1, 5), lab('Quiteca', 9, 2), lab('Agrofresh', 9, 4)])
    expect(r.map((l) => l.laboratorio)).toEqual(['Agrofresh', 'Quiteca', 'ALS'])
  })
})
