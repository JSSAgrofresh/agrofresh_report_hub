import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const excel = vi.hoisted(() => ({ descargarExcelDeFilas: vi.fn(), descargarExcelDeTabla: vi.fn() }))
vi.mock('@/lib/excel', () => excel)

import { BotonExcel } from './BotonExcel'

describe('BotonExcel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('con filas baja exactamente esas (la primera son los encabezados)', () => {
    render(<BotonExcel archivo="Lead time" filas={[['OT', 'Días'], ['OT-1', 3]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Lead time en Excel' }))
    expect(excel.descargarExcelDeFilas).toHaveBeenCalledWith('Lead time', 'Lead time', [['OT', 'Días'], ['OT-1', 3]])
  })

  it('con un contenedor baja la tabla que hay dentro, tal como se ve', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <>
        <div ref={ref}>
          <table><tbody><tr><td>a</td></tr></tbody></table>
        </div>
        <BotonExcel archivo="Envíos" contenedor={ref} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Envíos en Excel' }))
    expect(excel.descargarExcelDeTabla).toHaveBeenCalledTimes(1)
    expect(excel.descargarExcelDeTabla.mock.calls[0][2]).toBeInstanceOf(HTMLTableElement)
  })

  it('deshabilitado no baja nada', () => {
    render(<BotonExcel archivo="X" filas={[['a']]} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(excel.descargarExcelDeFilas).not.toHaveBeenCalled()
  })
})
