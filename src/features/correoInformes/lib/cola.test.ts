import { describe, expect, it } from 'vitest'
import { agrupar, clasificar } from './cola'
import { INFORME_OK, INFORME_ROJO } from '@/views/modules/datacore/fixturesIngreso'

const base = { ...INFORME_OK, hallazgos: [], resuelto_en: null, informado: false }

describe('clasificar', () => {
  it('rojo sin resolver: hay que avisar; si ya se avisó, queda esperando', () => {
    expect(clasificar({ ...INFORME_ROJO, resuelto_en: null, informado: false })).toBe('seguimiento')
    expect(clasificar({ ...INFORME_ROJO, resuelto_en: null, informado: true })).toBe('informado')
  })
  it('un hallazgo del envío manda sobre la homogeneización', () => {
    const h = [
      { nivel: 'amarillo' as const, codigo: 'faltan_destinatarios', texto: 'falta alguien' },
      { nivel: 'amarillo' as const, codigo: 'no_homogeneo', texto: 'x' },
    ]
    expect(clasificar({ ...base, estado: 'amarillo', hallazgos: h })).toBe('revisar')
  })
  it('solo no homogéneo → homogeneizar; los de nivel info no cuentan; sin hallazgos → listo', () => {
    const nh = [{ nivel: 'amarillo' as const, codigo: 'no_homogeneo', texto: 'x' }]
    expect(clasificar({ ...base, estado: 'amarillo', hallazgos: nh })).toBe('homogeneizar')
    expect(clasificar({ ...base, hallazgos: [{ nivel: 'info', codigo: 'especie_distinta', texto: 'x' }] })).toBe('listo')
    expect(agrupar([base, { ...base, id: 2 }]).listo).toHaveLength(2)
  })
})
