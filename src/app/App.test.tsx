import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { router } from './router'

describe('App', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await router.navigate('/')
  })

  it('redirige a login cuando no hay sesión', async () => {
    render(<App />)
    expect(await screen.findByText('Usuario')).toBeInTheDocument()
  })

  it('muestra el panel general cuando hay una sesión guardada', async () => {
    window.localStorage.setItem(
      'agrofresh.sesion',
      JSON.stringify({ email: 'jorge.sandoval@agrofresh.com', nombre: 'Jorge Sandoval', rol: 'aprobacion' }),
    )
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Panel general' })).toBeInTheDocument()
  })
})
