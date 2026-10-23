import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TarjetasAnalisis } from './TarjetasAnalisis'

describe('TarjetasAnalisis', () => {
  it('muestra el total de cada análisis y avisa cuál se tocó', () => {
    const onElegir = vi.fn()
    render(<TarjetasAnalisis totales={{ residuales: 1204, fsma: 1, fito: 0 }} acento="#4f8a26" onElegir={onElegir} />)
    expect(screen.getByText('1.204')).toBeInTheDocument()
    expect(screen.getByText('Residuos')).toBeInTheDocument()
    expect(screen.getByText('FSMA')).toBeInTheDocument()
    expect(screen.getByText('Fitopatología')).toBeInTheDocument()
    expect(screen.getAllByText('informe')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /FSMA/ }))
    expect(onElegir).toHaveBeenCalledWith('fsma')
    fireEvent.click(screen.getByRole('button', { name: /Fitopatología/ }))
    expect(onElegir).toHaveBeenLastCalledWith('fito')
  })
})
