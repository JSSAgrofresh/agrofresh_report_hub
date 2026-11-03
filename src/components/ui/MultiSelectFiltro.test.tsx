import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MultiSelectFiltro } from './MultiSelectFiltro'

function Prueba({ opciones, inicial, todosPorDefecto }: { opciones: string[]; inicial: string[]; todosPorDefecto?: boolean }) {
  const [valores, setValores] = useState(inicial)
  return <MultiSelectFiltro etiqueta="Filtro" opciones={opciones} valores={valores} onChange={setValores} todosPorDefecto={todosPorDefecto} />
}
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Todos|seleccionados|▼/ }))
const marcado = (t: string) => (screen.getByLabelText(t) as HTMLInputElement).checked

describe('MultiSelectFiltro', () => {
  it('permite marcar varias opciones a la vez', () => {
    render(<Prueba opciones={['A', 'B', 'C']} inicial={[]} />)
    abrir()
    fireEvent.click(screen.getByLabelText('A'))
    fireEvent.click(screen.getByLabelText('C'))
    expect([marcado('A'), marcado('B'), marcado('C')]).toEqual([true, false, true])
  })

  it('con todosPorDefecto: tocar una opción con todas marcadas deja solo esa, se suman más y Limpiar vuelve a marcar todas', () => {
    render(<Prueba opciones={['A', 'B', 'C']} inicial={['A', 'B', 'C']} todosPorDefecto />)
    abrir()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    fireEvent.click(screen.getByLabelText('B'))
    expect([marcado('A'), marcado('B'), marcado('C')]).toEqual([false, true, false])
    fireEvent.click(screen.getByLabelText('C'))
    expect([marcado('A'), marcado('B'), marcado('C')]).toEqual([false, true, true])
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect([marcado('A'), marcado('B'), marcado('C')]).toEqual([true, true, true])
  })

  it('con muchas opciones trae un buscador sin tildes ni mayúsculas', () => {
    const opciones = ['Árbol', 'Banano', 'Cereza', 'Durazno', 'Esparrago', 'Frambuesa', 'Guinda', 'Higo', 'Kiwi']
    render(<Prueba opciones={opciones} inicial={[]} />)
    abrir()
    fireEvent.change(screen.getByLabelText('Buscar en Filtro'), { target: { value: 'ARBOL' } })
    expect(screen.getByLabelText('Árbol')).toBeTruthy()
    expect(screen.queryByLabelText('Kiwi')).toBeNull()
  })

  it('con pocas opciones no hay buscador', () => {
    render(<Prueba opciones={['A', 'B']} inicial={[]} />)
    abrir()
    expect(screen.queryByLabelText('Buscar en Filtro')).toBeNull()
  })
})
