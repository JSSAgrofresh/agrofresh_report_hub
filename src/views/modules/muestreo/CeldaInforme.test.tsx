import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CeldaInforme } from './CeldaInforme'
import type { InformeSolicitud, Solicitud } from '@/features/tomaMuestras'

const inf = (extra: Partial<InformeSolicitud> = {}): InformeSolicitud => ({
  nro_informe: '2026-1885-PC', numeros: ['2026-1885-PC'], pdf_guardado: true, en_report: true, ...extra,
})
const sol = (informe: InformeSolicitud | null) => ({ numero_solicitud: 'OT-QUI0047', informe }) as Solicitud

describe('CeldaInforme', () => {
  it('sin informe: una raya, o «Esperando» si ya se envió', () => {
    const { unmount } = render(<CeldaInforme s={sol(null)} onAbrir={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    unmount()
    render(<CeldaInforme s={{ ...sol(null), enviada: true }} onAbrir={() => {}} />)
    expect(screen.getByText('Esperando')).toBeInTheDocument()
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

  it('marca con ✓ la OT que el informe confirma', () => {
    render(<CeldaInforme s={sol(inf({ verificacion: { estado: 'confirmada', motivos: [] } }))} onAbrir={() => {}} />)
    expect(screen.getByLabelText('OT confirmada')).toBeInTheDocument()
    expect(screen.queryByText('OT por revisar')).toBeNull()
  })

  it('avisa la OT por revisar con el motivo', () => {
    const v = { estado: 'revisar' as const, motivos: ['el informe dice OT-QUI0039'] }
    render(<CeldaInforme s={sol(inf({ verificacion: v }))} onAbrir={() => {}} />)
    expect(screen.getByText('OT por revisar')).toHaveAttribute('title', 'el informe dice OT-QUI0039')
    expect(screen.queryByLabelText('OT confirmada')).toBeNull()
  })

  it('sin confirmar: solo lo avisa si ya está en Report (si no, basta «Sin Report»)', () => {
    const v = { estado: 'sin_confirmar' as const, motivos: ['el informe no trae la OT'] }
    const { unmount } = render(<CeldaInforme s={sol(inf({ verificacion: v }))} onAbrir={() => {}} />)
    expect(screen.getByText('OT sin confirmar')).toBeInTheDocument()
    unmount()
    render(<CeldaInforme s={sol(inf({ en_report: false, verificacion: v }))} onAbrir={() => {}} />)
    expect(screen.queryByText('OT sin confirmar')).toBeNull()
    expect(screen.getByText('Sin Report')).toBeInTheDocument()
  })
})
