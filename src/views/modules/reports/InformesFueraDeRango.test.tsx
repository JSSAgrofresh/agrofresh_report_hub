import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Observacion } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import { InformesFueraDeRango } from './InformesFueraDeRango'

const p = (ingrediente: string, ppm: number, crop: string) => ({ ingrediente, ppm, crop }) as Observacion
const inf = (id: number, ...puntos: Observacion[]): InformeConPuntos => ({ solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos })

describe('InformesFueraDeRango', () => {
  // Sin elegir especie: cada informe se juzga con la de SU especie.
  const informes = [
    inf(1, p('FDL', 1, 'Clementina'), p('PYR', 2, 'Clementina')), // dentro
    inf(2, p('FDL', 3.5, 'Clementina')), // sobre (máx 3)
    inf(3, p('PYR', 0.5, 'Clementina')), // bajo (mín 1)
    inf(4, p('FDL', 4.5, 'Cerezas')), // Cerezas: FDL hasta 5 → dentro
    inf(5, p('FDL', 9, 'Papaya')), // especie fuera de la tabla
  ]

  it('cuenta informes fuera de rango, sobre y bajo, con % y total, sin pedir una especie', () => {
    render(<InformesFueraDeRango informes={informes} />)
    expect(screen.getByText('de 4 informes')).toBeTruthy()
    expect(screen.getByText('50,0% del total')).toBeTruthy()
    expect(screen.getByText('Sobre el límite', { selector: 'dt' }).parentElement?.textContent).toContain('1 informe · 25,0%')
    expect(screen.getByText('Bajo el límite', { selector: 'dt' }).parentElement?.textContent).toContain('1 informe · 25,0%')
    expect(screen.queryByText(/sin límite en la tabla/)).toBeNull()
    expect(screen.queryByText(/Cada informe se evalúa/)).toBeNull()
    const fdl = screen.getByText('FDL').closest('tr')!
    expect(within(fdl).getByText('0,70 – 5,00 ppm · según especie')).toBeTruthy()
    expect(within(fdl).getAllByText('1 · 33,3%').length).toBe(2) // sobre y fuera de rango: 1 de 3 evaluados
  })

  it('la fila Total suma los resultados evaluados, sobre y bajo', () => {
    render(<InformesFueraDeRango informes={informes} />)
    const total = screen.getByText('Total').closest('tr')!
    expect(within(total).getByText('5')).toBeTruthy() // 3 FDL (Clementina ×2, Cerezas) + 2 PYR; Papaya no se evalúa
    expect(within(total).getAllByText('1 · 20,0%').length).toBe(2) // 1 sobre y 1 bajo, de 5
    expect(within(total).getByText('2 · 40,0%')).toBeTruthy()
  })

  it('si ninguna especie está en la tabla lo dice', () => {
    render(<InformesFueraDeRango informes={[inf(1, p('FDL', 9, 'Papaya'))]} />)
    expect(screen.getByText(/no está en la tabla de límites residuales/)).toBeTruthy()
  })
})
