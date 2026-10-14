import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Observacion } from '@/features/reportes'
import type { InformeConPuntos } from '@/features/reportes/lib/graficoResiduales'
import { limitesDeEspecie } from '@/features/reportes'
import { InformesFueraDeRango } from './InformesFueraDeRango'

const p = (ingrediente: string, ppm: number) => ({ ingrediente, ppm }) as Observacion
const inf = (id: number, ...puntos: Observacion[]): InformeConPuntos => ({ solicitudId: id, nroSolicitud: `OT-${id}`, fecha: '2026-10-01', puntos })

describe('InformesFueraDeRango', () => {
  const informes = [inf(1, p('FDL', 1), p('PYR', 2)), inf(2, p('FDL', 3.5)), inf(3, p('PYR', 0.5)), inf(4, p('FDL', 2))]

  it('cuenta los informes con algún analito fuera de su franja y su % del total', () => {
    render(<InformesFueraDeRango informes={informes} especie="Clementina" limites={limitesDeEspecie('Clementina')} />)
    expect(screen.getByText('de 4 informes')).toBeTruthy()
    expect(screen.getByText('50% del total'.replace('50%', '50,0%'))).toBeTruthy()
    const fdl = screen.getByText('FDL').closest('tr')!
    expect(within(fdl).getByText('0,70 – 3,00 ppm')).toBeTruthy()
    expect(within(fdl).getByText('1 de 3')).toBeTruthy()
    expect(within(fdl).getByText('+0,50 ppm')).toBeTruthy()
  })

  it('sin especie pide elegir una; con una especie fuera de la tabla lo dice', () => {
    const { rerender } = render(<InformesFueraDeRango informes={informes} especie="" limites={null} />)
    expect(screen.getByText(/Elige una especie/)).toBeTruthy()
    rerender(<InformesFueraDeRango informes={informes} especie="Papaya" limites={null} />)
    expect(screen.getByText(/no trae la especie «Papaya»/)).toBeTruthy()
  })
})
