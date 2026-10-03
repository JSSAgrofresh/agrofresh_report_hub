import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CeldaInforme } from './CeldaInforme'
import type { InformeSolicitud, Solicitud } from '@/features/tomaMuestras'

const inf = (extra: Partial<InformeSolicitud> = {}): InformeSolicitud => ({
  nro_informe: '2026-1885-PC', numeros: ['2026-1885-PC'], pdf_guardado: true, en_report: true, ...extra,
})
const sol = (informe: InformeSolicitud | null) => ({ numero_solicitud: 'OT-QUI0047', informe }) as Solicitud

describe('CeldaInforme', () => {
  it('sin informe muestra una raya', () => {
    render(<CeldaInforme s={sol(null)} onAbrir={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('con informe muestra el N° y el clic abre el PDF', () => {
    const onAbrir = vi.fn()
    render(<CeldaInforme s={sol(inf())} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /2026-1885-PC/ }))
    expect(onAbrir).toHaveBeenCalled()
    expect(screen.queryByText('Sin Report')).toBeNull()
  })

  it('con PDF pero sin resultados en Report lo avisa', () => {
    render(<CeldaInforme s={sol(inf({ en_report: false }))} onAbrir={() => {}} />)
    expect(screen.getByText('Sin Report')).toHaveAttribute('title', expect.stringContaining('Filas pendientes'))
  })
})
