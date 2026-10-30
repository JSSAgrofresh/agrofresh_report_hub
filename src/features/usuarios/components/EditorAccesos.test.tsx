import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlantaAsignada } from '../types'
import { EditorAccesos } from './EditorAccesos'

const plantas = [
  { nombre: 'UNI SAN FERNANDO', cliente_nombre: 'UNIFRUTTI' },
  { nombre: 'UNI ROMERAL', cliente_nombre: 'UNIFRUTTI' },
  { nombre: 'DOLE LONTUE', cliente_nombre: 'DOLE' },
]

function Caja({ alCambiar }: { alCambiar: (n: PlantaAsignada[]) => void }) {
  const [a, setA] = useState<PlantaAsignada[]>([])
  const cambiar = (n: PlantaAsignada[]) => {
    alCambiar(n)
    setA(n)
  }
  return <EditorAccesos clientes={['DOLE', 'UNIFRUTTI']} plantas={plantas} especies={['Cerezas', 'Uva']} accesos={a} onChange={cambiar} />
}

describe('editor de accesos', () => {
  it('marca dos plantas y les aplica las mismas especies de una vez', () => {
    const salida = { v: [] as PlantaAsignada[] }
    render(<Caja alCambiar={(n) => (salida.v = n)} />)
    fireEvent.click(screen.getByRole('button', { name: /^UNIFRUTTI/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas las plantas' }))
    const lote = screen.getByText('2 plantas marcadas').parentElement as HTMLElement
    fireEvent.click(lote.querySelector('button[aria-pressed]') as HTMLElement) // Cerezas
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las marcadas' }))
    expect(salida.v).toHaveLength(2)
    expect(salida.v.every((x) => x.especie === 'Cerezas')).toBe(true)
  })

  it('«Todo el Sold To» guarda una sola fila sin planta', () => {
    const salida = { v: [] as PlantaAsignada[] }
    render(<Caja alCambiar={(n) => (salida.v = n)} />)
    fireEvent.click(screen.getByRole('button', { name: /^DOLE/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Todo el Sold To' }))
    expect(salida.v).toEqual([{ clienteNombre: 'DOLE', plantaNombre: null }])
  })
})
