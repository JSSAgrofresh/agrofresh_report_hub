import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoSolicitud } from './EstadoSolicitud'
import type { Solicitud } from '@/features/tomaMuestras'

const solicitud = (extra: Partial<Solicitud>) => ({ enviada: false, ...extra }) as Solicitud

describe('EstadoSolicitud', () => {
  it('pendiente sin la marca no muestra «Sin lista de distribución»', () => {
    render(<EstadoSolicitud s={solicitud({})} />)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.queryByText('Sin lista de distribución')).toBeNull()
  })

  it('pendiente sin lista muestra los dos estados', () => {
    render(<EstadoSolicitud s={solicitud({ sin_lista_distribucion: true })} />)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Sin lista de distribución')).toHaveAttribute('title', expect.stringContaining('solo a Jorge y Claudia'))
  })

  it('enviada sin lista también avisa que va solo a Jorge y Claudia', () => {
    render(<EstadoSolicitud s={solicitud({ enviada: true, sin_lista_distribucion: true })} />)
    expect(screen.getByText('Enviada')).toBeInTheDocument()
    expect(screen.getByText('Sin lista de distribución')).toHaveAttribute('title', expect.stringContaining('solo a Jorge y Claudia'))
  })
})
