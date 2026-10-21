import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraficoCajas } from './GraficoCajas'
import type { CajaDemora } from '@/features/correoInformes'

const CAJA: CajaDemora = { laboratorio: 'Quiteca', n: 6, minimo: 1, q1: 2.25, mediana: 3.5, q3: 4.75, maximo: 20, media: 5.8, bigote_bajo: 1, bigote_alto: 5, atipicos: [20], valores: [1, 2, 3, 4, 5, 20] }

describe('GraficoCajas', () => {
  it('dibuja una caja por laboratorio con su resumen al pasar el mouse', () => {
    render(<GraficoCajas cajas={[CAJA, { ...CAJA, laboratorio: 'AgroFresh', n: 1, valores: [2], atipicos: [], maximo: 2, minimo: 2, mediana: 2 }]} />)
    expect(screen.getByTestId('caja-Quiteca').querySelector('title')?.textContent).toMatch(/6 informes · mediana 3,5 d/)
    expect(screen.getByTestId('caja-AgroFresh')).toBeInTheDocument()
    // con 6 informes hay caja (rect) y un círculo vacío para el atípico; con 1 solo hay una línea y su punto
    expect(screen.getByTestId('caja-Quiteca').querySelectorAll('rect')).toHaveLength(1)
    expect(screen.getByTestId('caja-AgroFresh').querySelectorAll('rect')).toHaveLength(0)
    expect(screen.getByTestId('caja-Quiteca').querySelectorAll('circle')).toHaveLength(6)
  })

  it('sin datos lo dice', () => {
    render(<GraficoCajas cajas={[]} />)
    expect(screen.getByText(/no hay informes con su demora medida/)).toBeInTheDocument()
  })
})
