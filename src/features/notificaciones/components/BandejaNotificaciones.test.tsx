import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BandejaNotificaciones } from './BandejaNotificaciones'
import type { Notificacion } from '../types'

/**
 * La bandeja: la hora a la que llegó cada notificación y el buscador.
 *
 * El buscador va al SERVIDOR (busca en todas, no solo en las 60 de la
 * bandeja), así que acá se prueba que le pida lo escrito y que pinte lo que
 * vuelve, con las palabras resaltadas.
 */

const { listar } = vi.hoisted(() => ({ listar: vi.fn() }))

vi.mock('../api/notificacionesApi', () => ({
  notificacionesApi: {
    listar,
    misTipos: vi.fn().mockResolvedValue({ tipos: ['solicitud'] }),
    marcarLeida: vi.fn().mockResolvedValue({ estado: 'ok' }),
    marcarTodas: vi.fn().mockResolvedValue({ estado: 'ok' }),
  },
}))

function notif(id: number, titulo: string, creado_en: string, resumen = 'r'): Notificacion {
  return {
    id, titulo, resumen, cuerpo: '', categoria: 'sistema', audiencia: 'todos',
    publicado: true, creado_en, creado_por: 'Paz Salazar', leida: true,
    metadata: { tipo: 'solicitud' },
  }
}

const HOY = new Date()
HOY.setHours(14, 32, 0, 0)

beforeEach(() => {
  vi.clearAllMocks()
  listar.mockImplementation(async (q?: string) =>
    q
      ? [notif(9, 'Nueva solicitud OT-2026-0457', '2026-08-01T12:00:00Z', 'Frutícola Ñuble')]
      : [notif(1, 'Verificación diaria registrada', HOY.toISOString())],
  )
})

function pintar() {
  return render(
    <MemoryRouter>
      <BandejaNotificaciones onCerrar={() => {}} />
    </MemoryRouter>,
  )
}

describe('BandejaNotificaciones', () => {
  it('muestra la hora a la que llegó cada notificación', async () => {
    pintar()
    expect(await screen.findByText('Hoy, 14:32')).toBeInTheDocument()
  })

  it('busca en el servidor lo escrito y resalta lo encontrado', async () => {
    pintar()
    await screen.findByText('Verificación diaria registrada')

    fireEvent.change(screen.getByLabelText('Buscar notificaciones'), { target: { value: 'nuble 0457' } })

    await waitFor(() => expect(listar).toHaveBeenCalledWith('nuble 0457'))
    expect(await screen.findByText(/1 resultado para «nuble 0457»/)).toBeInTheDocument()
    expect(screen.queryByText('Verificación diaria registrada')).not.toBeInTheDocument()
    // Resaltado sin importar tildes ni mayúsculas.
    const marcas = [...document.querySelectorAll('mark')].map((m) => m.textContent)
    expect(marcas).toEqual(['0457', 'Ñuble'])
  })

  it('al limpiar la búsqueda vuelve a la bandeja', async () => {
    pintar()
    const campo = await screen.findByLabelText('Buscar notificaciones')
    fireEvent.change(campo, { target: { value: '0457' } })
    await screen.findByText(/resultado para/)

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(await screen.findByText('Verificación diaria registrada')).toBeInTheDocument()
  })

  it('dice cuando no encuentra nada', async () => {
    listar.mockImplementation(async (q?: string) => (q ? [] : []))
    pintar()
    fireEvent.change(await screen.findByLabelText('Buscar notificaciones'), { target: { value: 'zzz' } })
    expect(await screen.findByText('Sin resultados para «zzz».')).toBeInTheDocument()
  })
})
