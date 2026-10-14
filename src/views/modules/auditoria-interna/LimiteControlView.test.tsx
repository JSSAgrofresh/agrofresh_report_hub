import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/views/modules/reports/ReporteView', () => ({
  ReporteView: ({ vistaControl, limitesTabla, selectorModo }: { vistaControl: boolean; limitesTabla: boolean; selectorModo: ReactNode }) => (
    <div>
      {selectorModo}
      <p data-testid="modo">{vistaControl ? 'control' : limitesTabla ? 'residuales' : 'otro'}</p>
    </div>
  ),
}))

import { LimiteControlView } from './LimiteControlView'

describe('LimiteControlView', () => {
  it('parte en Límites residuales y cambia a Límites de control con el selector', () => {
    render(<LimiteControlView />)
    expect(screen.getByRole('heading', { name: 'Vista de límites' })).toBeTruthy()
    expect(screen.getByTestId('modo').textContent).toBe('residuales')
    expect(screen.getByRole('button', { name: 'Límites residuales' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Límites de control' }))
    expect(screen.getByTestId('modo').textContent).toBe('control')
    expect(screen.getByRole('button', { name: 'Límites de control' }).getAttribute('aria-pressed')).toBe('true')
  })
})
