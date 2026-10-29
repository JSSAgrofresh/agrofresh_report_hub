import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ResumenCostoKilo } from '@/features/costoKilo'

vi.mock('./costoKilo/SeccionCostoKilo', () => ({ ID_COSTO_KILO: 'costo-kilo', SeccionCostoKilo: ({ numero }: { numero: number }) => <div>seccion costo {numero}</div> }))

import { ReporteAccutab } from './ReporteAccutab'

const ck = { carpeta: '2026-11-02_09-00-00' } as ResumenCostoKilo
const props = { cargas: [], verCarga: vi.fn(), accionesDe: () => null }

describe('ReporteAccutab con costo por kilo', () => {
  it('sin ningún informe de costo por kilo no hay tarjeta ni sección', () => {
    render(<ReporteAccutab {...props} costoKilo={{ informes: [], modo: 'cliente' }} />)
    expect(screen.getByText('Aún no hay informes disponibles')).toBeInTheDocument()
    expect(screen.queryByText(/seccion costo/)).not.toBeInTheDocument()
  })

  it('con informes de costo por kilo aparece su tarjeta y su sección; sin informes de Accu-Tab es la número 1', () => {
    render(<ReporteAccutab {...props} costoKilo={{ informes: [ck], modo: 'cliente' }} />)
    expect(screen.getByRole('button', { name: /Costo por kilo: 1 informes/ })).toBeInTheDocument()
    expect(screen.getByText('seccion costo 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Accutab/ })).not.toBeInTheDocument()
  })
})
