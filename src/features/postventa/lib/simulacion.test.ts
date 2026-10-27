import { describe, expect, it } from 'vitest'
import { generarAccutabSimulado } from './simulacion'

describe('generarAccutabSimulado', () => {
  const sim = generarAccutabSimulado(30, 5, new Date(Date.UTC(2026, 9, 27)))

  it('genera 30 informes simulados, sin PDF, del más nuevo al más antiguo', () => {
    expect(sim.informes).toHaveLength(30)
    expect(sim.informes.every((i) => !i.tiene_pdf && i.cliente?.includes('(Sim.)'))).toBe(true)
    const carpetas = sim.informes.map((i) => i.carpeta)
    expect(carpetas).toEqual([...carpetas].sort().reverse())
  })

  it('cada informe trae sus mediciones y su resumen calza con ellas', () => {
    const d = sim.detalle(sim.informes[0].carpeta)!
    expect(d.filas.length).toBe(sim.informes[0].n_registros)
    expect(d.estadisticas?.n).toBe(d.filas.length)
    expect(d.limites).toMatchObject({ phMin: 6.5, phMax: 8 })
    expect(sim.detalle('2000-01-01_00-00-00')).toBeNull()
  })

  it('con la misma semilla da lo mismo', () => {
    const otra = generarAccutabSimulado(30, 5, new Date(Date.UTC(2026, 9, 27)))
    expect(otra.informes).toEqual(sim.informes)
  })
})
