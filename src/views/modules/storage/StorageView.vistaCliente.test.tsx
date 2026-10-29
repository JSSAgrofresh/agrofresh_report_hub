import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PortalContext } from '@/components/layout/portal/PortalContext'
import { StorageView } from './StorageView'

vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ user: { tipoAcceso: 'admin_general', email: 'a@b.c' } }) }))
vi.mock('./ArbolCarpetas', () => ({ ArbolCarpetas: ({ espacio }: { espacio: { etiqueta: string } }) => <div>árbol {espacio.etiqueta}</div> }))
vi.mock('./Explorador', () => ({ Explorador: ({ puedeEscribir }: { puedeEscribir: boolean }) => <div>explorador {String(puedeEscribir)}</div> }))
vi.mock('./BusquedaGlobal', () => ({ BusquedaGlobal: () => <div>búsqueda global</div> }))

afterEach(cleanup)

describe('Storage', () => {
  it('en la Vista de cliente («Informes de Laboratorio») muestra solo la carpeta Informes, para mirar', () => {
    render(
      <PortalContext.Provider value={true}>
        <StorageView />
      </PortalContext.Provider>,
    )
    expect(screen.getByText('árbol Informes')).toBeInTheDocument()
    expect(screen.queryByText('árbol Archivos del servidor')).toBeNull()
    expect(screen.queryByText('árbol Solicitudes')).toBeNull()
    expect(screen.queryByText('árbol Accutab')).toBeNull()
    expect(screen.queryByText('búsqueda global')).toBeNull()
    expect(screen.getByText('explorador false')).toBeInTheDocument()
  })

  it('el Storage interno de siempre conserva todos los espacios', () => {
    render(<StorageView />)
    expect(screen.getByText('árbol Archivos del servidor')).toBeInTheDocument()
    expect(screen.getByText('árbol Informes')).toBeInTheDocument()
    expect(screen.getByText('búsqueda global')).toBeInTheDocument()
  })
})
