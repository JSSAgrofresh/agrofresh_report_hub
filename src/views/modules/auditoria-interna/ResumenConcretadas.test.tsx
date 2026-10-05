import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResumenConcretadas } from './ResumenConcretadas'

const totales = { emitidas: 55, concretadas: 11, sinReport: 3, pendientes: 41, porcentajeConcretado: 20 }

describe('ResumenConcretadas', () => {
  it('muestra solo Informes recibidos y Solicitudes enviadas, sin «PDF sin Report»', () => {
    render(<ResumenConcretadas totales={totales} />)
    expect(screen.getByText('Informes recibidos')).toBeTruthy()
    expect(screen.getByText('Solicitudes enviadas')).toBeTruthy()
    expect(screen.queryByText('PDF sin Report')).toBeNull()
    expect(screen.queryByText('Concretadas')).toBeNull()
    expect(screen.queryByText('Pendientes')).toBeNull()
  })

  it('el PDF sin Report se suma a las solicitudes enviadas', () => {
    render(<ResumenConcretadas totales={totales} />)
    expect(screen.getByText('44')).toBeTruthy() // 41 pendientes + 3 sin Report
  })
})
