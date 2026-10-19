import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { agruparPlantas } from '../lib/plantas'
import { PlantasAsignadas } from './PlantasAsignadas'

const plantas = [
  { clienteNombre: 'VERFRUT', plantaNombre: 'VERFRUT SAN FERNANDO' },
  { clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' },
  { clienteNombre: 'VERFRUT', plantaNombre: 'VERFRUT RAPEL' },
  { clienteNombre: 'DOLE', plantaNombre: null },
]

describe('plantas asignadas a un comercial', () => {
  it('se agrupan por cliente en orden, con «todo el Sold To» primero', () => {
    const g = agruparPlantas(plantas)
    expect(g.map((x) => x.cliente)).toEqual(['DOLE', 'VERFRUT'])
    expect(g[0].plantas.map((p) => p.plantaNombre)).toEqual([null, 'DOLE LONTUE'])
    expect(g[1].plantas.map((p) => p.plantaNombre)).toEqual(['VERFRUT RAPEL', 'VERFRUT SAN FERNANDO'])
  })

  it('resume cuántas son y las busca sin importar tildes ni mayúsculas', () => {
    render(<PlantasAsignadas plantas={plantas} onChange={() => {}} />)
    expect(screen.getByText('4 plantas en 2 clientes')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rapél' } })
    expect(screen.getByText('VERFRUT RAPEL')).toBeTruthy()
    expect(screen.queryByText('DOLE LONTUE')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText(/Ninguna planta coincide/)).toBeTruthy()
  })

  it('quita una planta o todo un cliente', () => {
    const onChange = vi.fn()
    render(<PlantasAsignadas plantas={plantas} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar VERFRUT · VERFRUT RAPEL' }))
    expect(onChange).toHaveBeenLastCalledWith(plantas.filter((p) => p.plantaNombre !== 'VERFRUT RAPEL'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todo DOLE' }))
    expect(onChange).toHaveBeenLastCalledWith(plantas.filter((p) => p.clienteNombre !== 'DOLE'))
  })
})
