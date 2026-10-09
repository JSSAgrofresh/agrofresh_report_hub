import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Hitos } from '@/features/auditoriaInterna'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'

const d = (dia: number) => `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z`
const sol = (archivo: string, p: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria => ({
  archivo, numero_solicitud: archivo, laboratorio: 'QUITECA', sold_to: 'A', ship_to: 'B', especie: null, variedad: null,
  tipo_servicio: null, analitos: [], fecha_solicitud: null, fecha_muestreo: null, emitida_en: d(1),
  informe: null, en_report: false, concretada: false, ...p,
})
const hit = (archivo: string, p: Partial<Hitos>): Hitos => ({
  archivo, emitida: d(1), enviada: d(2), informe: null, informe_fuente: null, report: null, en_report: false, cliente: null, ...p,
})

vi.mock('@/features/auditoriaInterna', async (original) => {
  const real = await original<typeof import('@/features/auditoriaInterna')>()
  return {
    ...real,
    useEntrega: () => ({
      hitos: new Map([
        ['1', hit('1', { informe: d(6) })],
        ['2', hit('2', { informe: d(8) })],
      ]),
      calidad: null,
      reglas: { entregado: 'concretado', plazos: { QUITECA: 12 }, cambiado_por: null, cambiado_en: null },
      error: null,
      guardar: vi.fn(),
    }),
  }
})

import { IndicadoresEntrega } from './IndicadoresEntrega'

describe('IndicadoresEntrega', () => {
  const solicitudes = [sol('1', { concretada: true }), sol('2', { concretada: true }), sol('3')]

  it('ya no trae el bloque largo «¿Cómo se calcula este número?»: la explicación va en globitos', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.queryByText('¿Cómo se calcula este número?')).toBeNull()
    expect(screen.queryByText(/Por qué la mediana y no el promedio/)).toBeNull()
    // la explicación sigue ahí, en un globito que se abre al pasar el mouse o enfocar
    const globitos = screen.getAllByRole('tooltip', { hidden: true })
    expect(globitos.some((g) => /mediana y no el promedio/.test(g.textContent ?? ''))).toBe(true)
    expect(globitos.some((g) => /percentil 90/.test(g.textContent ?? ''))).toBe(true)
  })

  it('deja una línea con la fórmula y cuántas solicitudes entran', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.getAllByText(/entran al cálculo/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Lead time/, { selector: 'b' })).toBeTruthy()
  })
})
