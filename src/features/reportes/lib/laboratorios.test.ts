import { describe, expect, it } from 'vitest'
import { laboratorioBase } from './filtros'
import { laboratorioTabular } from './laboratorios'

describe('laboratorioTabular', () => {
  it('ALS y Diagnofruit se ven en tabla, escritos como los escriba cada sistema', () => {
    for (const lab of ['ALS (Corthon)', 'Als', 'ALS', ' als ']) expect(laboratorioTabular(lab)).toBe('als')
    for (const lab of ['Diagnofruit', 'DIAGNOFRUIT']) expect(laboratorioTabular(lab)).toBe('diagnofruit')
  })
  it('los laboratorios de residuos y los vacíos van a los gráficos', () => {
    for (const lab of ['Quiteca', 'Agrofresh', 'AGROFRESH', '', null, undefined]) expect(laboratorioTabular(lab)).toBeNull()
  })
  it('laboratorioBase quita el paréntesis y las mayúsculas', () => {
    expect(laboratorioBase('ALS (Corthon)')).toBe('als')
  })
})
