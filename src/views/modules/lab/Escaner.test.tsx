import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Escaner } from './Escaner'

const ITEMS = [{ codigo: 'GCNPD10062' }, { codigo: 'GCNPD10063' }]

function montar(props: Partial<Parameters<typeof Escaner<{ codigo: string }>>[0]> = {}) {
  const onEncontrado = vi.fn()
  const onLimpiar = vi.fn()
  render(
    <Escaner
      buscar={(t) => ITEMS.find((i) => i.codigo === t.trim()) ?? null}
      onEncontrado={onEncontrado}
      onLimpiar={onLimpiar}
      placeholder="Escanea el código"
      mensajeNoEncontrado={(c) => `No existe ${c}`}
      {...props}
    />,
  )
  return { campo: screen.getByLabelText('Escanea el código'), onEncontrado, onLimpiar }
}

describe('Escaner', () => {
  it('encuentra en cuanto el código está completo, sin apretar Enter', () => {
    /* La mayoría de los lectores no manda Enter al final. */
    const { campo, onEncontrado } = montar()
    fireEvent.change(campo, { target: { value: 'GCNPD10062' } })
    expect(onEncontrado).toHaveBeenCalledWith({ codigo: 'GCNPD10062' })
  })

  it('no resuelve con un código a medias', () => {
    /* A media lectura, un prefijo puede calzar con varios: elegir ahí sería
     * elegir cualquiera. */
    const { campo, onEncontrado } = montar()
    fireEvent.change(campo, { target: { value: 'GCNPD100' } })
    expect(onEncontrado).not.toHaveBeenCalled()
  })

  it('no dice "no existe" mientras todavía se está escribiendo', () => {
    const { campo } = montar()
    fireEvent.change(campo, { target: { value: 'GCNPD100' } })
    expect(screen.queryByText(/No existe/)).toBeNull()
  })

  it('avisa que no existe solo al cerrar con Enter', () => {
    const { campo } = montar()
    fireEvent.change(campo, { target: { value: 'INVENTADO' } })
    fireEvent.submit(campo.closest('form')!)
    expect(screen.getByText('No existe INVENTADO')).toBeTruthy()
  })

  describe('Limpiar', () => {
    it('vacía el campo y suelta lo elegido', () => {
      const { campo, onLimpiar } = montar()
      fireEvent.change(campo, { target: { value: 'GCNPD10062' } })
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Limpiar' }))
      expect((campo as HTMLInputElement).value).toBe('')
      expect(onLimpiar).toHaveBeenCalled()
    })

    it('funciona aunque el campo tenga el foco', () => {
      /* Este es EL caso: mientras se escanea, el foco está en el campo —es lo
       * que hace que la pistola escriba ahí—. Con `onClick`, el campo perdía
       * el foco antes de que llegara el click, la caja se volvía a dibujar y
       * el click se perdía: el botón no hacía nada. */
      const { campo, onLimpiar } = montar()
      fireEvent.change(campo, { target: { value: 'GCNPD10062' } })
      campo.focus()
      expect(document.activeElement).toBe(campo)

      const boton = screen.getByRole('button', { name: 'Limpiar' })
      const evento = fireEvent.mouseDown(boton)

      expect(onLimpiar).toHaveBeenCalled()
      expect((campo as HTMLInputElement).value).toBe('')
      // preventDefault es lo que impide que el campo pierda el foco.
      expect(evento).toBe(false)
    })

    it('deja el foco en el campo, listo para el siguiente disparo', () => {
      const { campo } = montar()
      fireEvent.change(campo, { target: { value: 'GCNPD10062' } })
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Limpiar' }))
      expect(document.activeElement).toBe(campo)
    })

    it('no aparece cuando no hay nada que limpiar', () => {
      montar()
      expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    })
  })

  it('toma el foco cuando el paso anterior queda resuelto', () => {
    const propiedades = {
      buscar: (texto: string) => ITEMS.find((item) => item.codigo === texto.trim()) ?? null,
      onEncontrado: vi.fn(),
      placeholder: 'Escanea el código',
      mensajeNoEncontrado: (codigo: string) => `No existe ${codigo}`,
    }
    const { rerender } = render(<Escaner {...propiedades} tomarFoco={false} />)
    const campo = screen.getByLabelText('Escanea el código')
    expect(document.activeElement).not.toBe(campo)

    rerender(<Escaner {...propiedades} tomarFoco />)

    expect(document.activeElement).toBe(campo)
  })

  it('deshabilitado no deja escanear', () => {
    const { campo } = montar({ deshabilitado: true, motivoDeshabilitado: 'Carga primero el GC' })
    expect((campo as HTMLInputElement).disabled).toBe(true)
    expect((campo as HTMLInputElement).placeholder).toBe('Carga primero el GC')
  })
})
