import { describe, expect, it } from 'vitest'
import type { Usuario } from '@/features/usuarios'
import { ocultaPanelGeneral, rutaDeInicioPortal } from './inicio'

const base = { id: '1', nombre: 'Planta', email: 'c@x.cl' } as const
const cuenta = (extra: Partial<Usuario>) => ({ ...base, ...extra }) as Usuario

describe('inicio del portal de clientes', () => {
  it('con Report aterriza en los gráficos y no muestra el Panel general', () => {
    const u = cuenta({ tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['reports', 'storage'], reportes: ['laboratorio'] })
    expect(rutaDeInicioPortal(u)).toBe('/modulos/reportes/laboratorio')
    expect(ocultaPanelGeneral(u)).toBe(true)
  })

  it('sin Report pero con Storage aterriza en Storage', () => {
    const u = cuenta({ tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['storage'], reportes: [] })
    expect(rutaDeInicioPortal(u)).toBe('/modulos/storage')
  })

  it('si sus informes Accu-Tab viven en el panel, el Panel general se queda en el menú', () => {
    const u = cuenta({ tipoAcceso: 'cliente', area: 'cromatografia', modulos: ['reports'], reportes: ['laboratorio', 'postventa'] })
    expect(rutaDeInicioPortal(u)).toBe('/modulos/reportes/laboratorio')
    expect(ocultaPanelGeneral(u)).toBe(false)
  })

  it('solo Accu-Tab: se queda en el panel', () => {
    const u = cuenta({ tipoAcceso: 'cliente', area: 'postventa', modulos: [], reportes: ['postventa'] })
    expect(rutaDeInicioPortal(u)).toBeNull()
    expect(ocultaPanelGeneral(u)).toBe(false)
  })

  it('el personal interno no cambia', () => {
    expect(rutaDeInicioPortal(cuenta({ tipoAcceso: 'admin_general' }))).toBeNull()
    expect(ocultaPanelGeneral(cuenta({ tipoAcceso: 'admin_general' }))).toBe(false)
  })
})
