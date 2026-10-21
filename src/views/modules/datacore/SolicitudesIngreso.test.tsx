import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { filtrarSolicitudes } from '@/features/correoInformes'
import { SolicitudesIngreso } from './SolicitudesIngreso'
import { PANEL } from './fixturesIngreso'

describe('SolicitudesIngreso', () => {
  it('parte en las que esperan su informe, con los días que llevan', () => {
    render(<SolicitudesIngreso panel={PANEL} onVerInforme={() => {}} />)
    expect(screen.getByText('OT-QUI0053')).toBeInTheDocument()
    expect(screen.getByText('OT-ALS0019')).toBeInTheDocument()
    expect(screen.queryByText('OT-QUI0051')).not.toBeInTheDocument()
    expect(screen.getByText('lleva 4,5 d')).toBeInTheDocument()
  })

  it('cada filtro cuenta y muestra lo suyo; las recibidas dicen cuánto demoraron', () => {
    render(<SolicitudesIngreso panel={PANEL} onVerInforme={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Informe recibido/ }))
    expect(screen.getByText('OT-QUI0051')).toBeInTheDocument()
    expect(screen.getByText('6 d')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    expect(screen.getAllByRole('row')).toHaveLength(1 + PANEL.solicitudes.length)
  })

  it('busca sin importar tildes ni mayúsculas', () => {
    expect(filtrarSolicitudes(PANEL.solicitudes, 'todas', 'dolé').map((s) => s.ot)).toEqual(['OT-QUI0050'])
    expect(filtrarSolicitudes(PANEL.solicitudes, 'esperando', 'moral').map((s) => s.ot)).toEqual(['OT-ALS0019'])
  })

  it('el N° de informe lleva a verlo en la bandeja', () => {
    const onVer = vi.fn()
    render(<SolicitudesIngreso panel={PANEL} filtroInicial="recibido" onVerInforme={onVer} />)
    fireEvent.click(screen.getByRole('button', { name: '2026-1912-PC' }))
    expect(onVer).toHaveBeenCalledWith('2026-1912-PC')
  })

  it('sin solicitudes lo dice', () => {
    render(<SolicitudesIngreso panel={{ ...PANEL, solicitudes: [] }} onVerInforme={() => {}} />)
    expect(screen.getByText(/No hay solicitudes enviadas/)).toBeInTheDocument()
  })
})
