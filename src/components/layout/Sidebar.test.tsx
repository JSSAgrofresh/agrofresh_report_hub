import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/features/auth/context/AuthContext'
import { Sidebar } from './Sidebar'

const VALOR = {
  user: { id: '1', nombre: 'Jorge Sandoval', email: 'j@agrofresh.com', tipoAcceso: 'admin_general' },
  login: async () => {},
  logout: async () => {},
  refrescar: async () => {},
  sincronizando: false,
}

function montar() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={VALOR as never}>
        <Sidebar abierto={false} onCerrar={() => {}} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function barra() {
  return document.querySelector('aside') as HTMLElement
}

/** El botón se muestra solo desde 881px (en móvil la barra ya es un cajón).
 *  jsdom no evalúa media queries: acá lo ve siempre con la regla base
 *  `display: none`, y por eso queda fuera del árbol de accesibilidad y
 *  `getByRole` no lo encuentra. Se busca por su atributo, que es lo que de
 *  verdad se quiere comprobar; que aparezca a partir de ese ancho está
 *  verificado en un navegador de verdad. */
function boton(nombre: string): HTMLElement {
  const encontrado = document.querySelector(`button[aria-label="${nombre}"]`)
  if (!encontrado) throw new Error(`No hay ningún botón con aria-label "${nombre}".`)
  return encontrado as HTMLElement
}

afterEach(() => {
  localStorage.clear()
})

describe('Sidebar plegable', () => {
  it('empieza desplegada y el botón ofrece plegarla', () => {
    montar()

    expect(boton('Plegar el menú')).toHaveAttribute('aria-expanded', 'true')
  })

  it('al plegarla el botón ofrece lo contrario', () => {
    montar()

    fireEvent.click(boton('Plegar el menú'))

    expect(boton('Desplegar el menú')).toHaveAttribute('aria-expanded', 'false')
  })

  it('recuerda que quedó plegada', () => {
    const { unmount } = montar()
    fireEvent.click(boton('Plegar el menú'))
    unmount()

    montar()

    expect(boton('Desplegar el menú')).toBeInTheDocument()
  })

  it('sin poder guardar la preferencia igual se pliega', () => {
    // Ventana privada o cookies bloqueadas: setItem lanza. Que no se pueda
    // recordar no puede impedir plegarla ahora.
    const guardar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('acceso denegado')
    })
    montar()

    fireEvent.click(boton('Plegar el menú'))

    expect(boton('Desplegar el menú')).toBeInTheDocument()
    guardar.mockRestore()
  })

  it('plegada conserva todos los enlaces: se ocultan las etiquetas, no la navegación', () => {
    montar()
    const antes = within(barra()).getAllByRole('link').length

    fireEvent.click(boton('Plegar el menú'))

    expect(within(barra()).getAllByRole('link')).toHaveLength(antes)
  })

  it('cada enlace lleva su nombre en un title', () => {
    // Plegada, el tooltip del navegador es lo ÚNICO que dice qué es cada
    // icono. Un enlace sin title queda mudo.
    montar()

    for (const enlace of within(barra()).getAllByRole('link')) {
      expect(enlace).toHaveAttribute('title', expect.stringMatching(/\S/))
    }
  })
})
