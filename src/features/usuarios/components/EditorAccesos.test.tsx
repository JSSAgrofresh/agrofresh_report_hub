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
  it('la casilla da o quita el acceso y el lote deja las mismas especies en las plantas con acceso', () => {
    const salida = { v: [] as PlantaAsignada[] }
    render(<Caja alCambiar={(n) => (salida.v = n)} />)
    fireEvent.click(screen.getByRole('button', { name: /^UNIFRUTTI/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas las plantas' }))
    expect(salida.v).toHaveLength(2)
    expect(salida.v.every((x) => !x.especie)).toBe(true)
    const lote = screen.getByText('2 plantas con acceso').parentElement as HTMLElement
    fireEvent.click(lote.querySelector('button[aria-pressed]') as HTMLElement) // Cerezas
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 2' }))
    expect(salida.v).toHaveLength(2)
    expect(salida.v.every((x) => x.especie === 'Cerezas')).toBe(true)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(salida.v).toHaveLength(1)
  })

  it('«Todo el Sold To» guarda una sola fila sin planta', () => {
    const salida = { v: [] as PlantaAsignada[] }
    render(<Caja alCambiar={(n) => (salida.v = n)} />)
    fireEvent.click(screen.getByRole('button', { name: /^DOLE/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Todo el Sold To' }))
    expect(salida.v).toEqual([{ clienteNombre: 'DOLE', plantaNombre: null }])
  })

  it('abre solo el primer cliente con acceso y pone sus plantas con acceso primero', () => {
    const accesos: PlantaAsignada[] = [{ clienteNombre: 'UNIFRUTTI', plantaNombre: 'UNI ROMERAL', especie: 'Uva' }]
    render(<EditorAccesos clientes={['DOLE', 'UNIFRUTTI']} plantas={plantas} especies={['Cerezas', 'Uva']} accesos={accesos} onChange={() => {}} />)
    const clientesLista = screen.getByRole('list', { name: 'Clientes' })
    expect(clientesLista.querySelector('li')?.textContent).toContain('UNIFRUTTI')
    const nombres = Array.from(screen.getByRole('list', { name: 'Plantas' }).querySelectorAll('b')).map((b) => b.textContent)
    expect(nombres).toEqual(['UNI ROMERAL', 'UNI SAN FERNANDO'])
  })

  it('el buscador encuentra por Sold To y también por Ship To', () => {
    render(<EditorAccesos clientes={['DOLE', 'UNIFRUTTI']} plantas={plantas} especies={['Cerezas', 'Uva']} accesos={[]} onChange={() => {}} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lontue' } })
    const lista = screen.getByRole('list', { name: 'Clientes' })
    expect(lista.textContent).toContain('DOLE')
    expect(lista.textContent).not.toContain('UNIFRUTTI')
    // Se abre el cliente que coincide y solo se ve la planta buscada.
    expect(screen.getByText('DOLE LONTUE')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'romeral' } })
    expect(screen.getByText('UNI ROMERAL')).toBeTruthy()
    expect(screen.queryByText('UNI SAN FERNANDO')).toBeNull()
  })
})
