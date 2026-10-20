import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsuarioForm } from './UsuarioForm'
import type { Usuario } from '../types'

const { buscar } = vi.hoisted(() => ({ buscar: vi.fn() }))
vi.mock('../api/usuariosStore', async (original) => ({
  ...(await original<typeof import('../api/usuariosStore')>()),
  buscarPlantasDeComercial: buscar,
}))

vi.mock('@/features/catalogo', () => ({
  listarClientes: vi.fn().mockResolvedValue([]),
  listarPlantas: vi.fn().mockResolvedValue([]),
}))

const cuenta: Usuario = {
  id: '9', email: 'toma@agrofresh.com', nombre: 'Toma', tipoAcceso: 'admin_area', area: 'cromatografia',
}

function guardar(usuario: Usuario, antes?: () => void) {
  const onGuardar = vi.fn()
  render(<UsuarioForm usuario={usuario} onGuardar={onGuardar} onCancelar={() => {}} />)
  antes?.()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  return onGuardar
}

describe('UsuarioForm: secciones de AgroFresh Lab', () => {
  it('con las tres marcadas no guarda nada especial (la cuenta sigue viendo todo)', () => {
    const onGuardar = guardar(cuenta)
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toContain('agrofresh_lab')
    expect(modulos.some((m) => m.startsWith('lab_'))).toBe(false)
  })

  it('al desmarcar «Verificaciones diarias» se guardan solo las otras dos', () => {
    const onGuardar = guardar(cuenta, () => fireEvent.click(screen.getByRole('checkbox', { name: /Verificaciones diarias/ })))
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toEqual(expect.arrayContaining(['agrofresh_lab', 'lab_ingreso', 'lab_envio']))
    expect(modulos).not.toContain('lab_verificaciones')
  })

  it('una cuenta que ya tenía secciones elegidas las muestra marcadas tal cual', () => {
    render(
      <UsuarioForm
        usuario={{ ...cuenta, modulos: ['agrofresh_lab', 'lab_ingreso'] }}
        onGuardar={() => {}}
        onCancelar={() => {}}
      />,
    )
    expect((screen.getByRole('checkbox', { name: /Ingreso al laboratorio/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Verificaciones diarias/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('no deja guardar con AgroFresh Lab activo y ninguna sección', () => {
    const onGuardar = guardar(cuenta, () => {
      for (const n of [/Ingreso al laboratorio/, /Verificaciones diarias/, /Envío de informes/]) {
        fireEvent.click(screen.getByRole('checkbox', { name: n }))
      }
    })
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/al menos una sección de AgroFresh Lab/)).toBeTruthy()
  })
})

describe('UsuarioForm: permisos por categoría y funciones sueltas', () => {
  it('muestra todo por categoría y deja bloqueado lo que es solo del administrador general', () => {
    render(<UsuarioForm usuario={cuenta} onGuardar={() => {}} onCancelar={() => {}} />)
    for (const n of ['Data Core', 'Resultados y auditoría', 'AgroFresh Lab', 'Toma de muestras', 'Archivos']) {
      expect(screen.getByRole('region', { name: n })).toBeTruthy()
    }
    const reservada = screen.getByRole('region', { name: 'Solo administrador general' })
    expect(reservada.textContent).toMatch(/Usuarios y permisos/)
    expect(reservada.textContent).toMatch(/Administración General/)
    expect(reservada.querySelectorAll('input')).toHaveLength(0) // no hay casillas: no se pueden repartir
  })

  it('se puede asignar «Editar los criterios» a una cuenta y viaja en `modulos`', () => {
    const onGuardar = guardar(cuenta, () => fireEvent.click(screen.getByRole('checkbox', { name: /Modificar los criterios/ })))
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toContain('lab_criterios')
  })

  it('«Marcar todo» de una categoría marca sus permisos', () => {
    const onGuardar = guardar(
      { ...cuenta, modulos: [] },
      () => fireEvent.click(within(screen.getByRole('region', { name: 'Data Core' })).getByRole('button', { name: 'Marcar todo' })),
    )
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toEqual(expect.arrayContaining(['ingesta', 'trace', 'converter']))
  })

  it('un cliente no tiene área ni módulos: solo se elige qué ve', () => {
    const cliente: Usuario = { id: '5', email: 'c@dole.com', nombre: 'Dole', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.' }
    render(<UsuarioForm usuario={cliente} onGuardar={() => {}} onCancelar={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Data Core' })).toBeNull()
    expect(screen.queryByLabelText('Área')).toBeNull()
    expect((screen.getByRole('checkbox', { name: /Report de laboratorio/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Informes Accu-Tab/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Storage/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('guardar un cliente con Report y Accu-Tab no manda área y solo lleva módulos de cliente', () => {
    const cliente: Usuario = { id: '5', email: 'c@dole.com', nombre: 'Dole', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.' }
    const onGuardar = guardar(cliente, () => fireEvent.click(screen.getByRole('checkbox', { name: /Informes Accu-Tab/ })))
    const datos = onGuardar.mock.calls[0][0] as Omit<Usuario, 'id'>
    expect(datos.reportes).toEqual(['laboratorio', 'postventa'])
    expect(datos.modulos).toEqual(['reports'])
    expect(datos.area).toBeUndefined()
  })

  it('no deja guardar un cliente sin nada que ver', () => {
    const cliente: Usuario = { id: '5', email: 'c@dole.com', nombre: 'Dole', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.' }
    const onGuardar = guardar(cliente, () => fireEvent.click(screen.getByRole('checkbox', { name: /Report de laboratorio/ })))
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/Elige qué ve el cliente/)).toBeTruthy()
  })

  it('gerencia antigua (sin lista) muestra todo marcado pero editable; Panel de control interno no', () => {
    render(<UsuarioForm usuario={{ ...cuenta, tipoAcceso: 'gerencia', area: undefined, modulos: undefined }} onGuardar={() => {}} onCancelar={() => {}} />)
    const box = screen.getByRole('checkbox', { name: /Storage/ }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Panel de control interno/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('una gerencia nueva parte sin nada marcado', () => {
    render(<UsuarioForm onGuardar={() => {}} onCancelar={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /Gerencia/ }))
    expect((screen.getByRole('checkbox', { name: /Storage/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('administrador general ve todo sin poder cambiarlo', () => {
    render(<UsuarioForm usuario={{ ...cuenta, tipoAcceso: 'admin_general', area: undefined }} onGuardar={() => {}} onCancelar={() => {}} />)
    const box = screen.getByRole('checkbox', { name: /Storage/ }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
  })
})

describe('UsuarioForm: cuenta de comercial', () => {
  const comercial: Usuario = {
    id: '7', email: 'com@agrofresh.com', nombre: 'Com', tipoAcceso: 'comercial',
    modulos: ['reports', 'storage'], reportes: ['laboratorio'],
    plantasAsignadas: [{ clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' }],
  }
  const storage = () => screen.getByRole('checkbox', { name: /^Storage/ })
  const report = () => screen.getByRole('checkbox', { name: /^Report(?!e)/ })

  it('guarda sus plantas y solo lo que abre, sin área', () => {
    const onGuardar = guardar(comercial, () => fireEvent.click(storage()))
    const datos = onGuardar.mock.calls[0][0] as Usuario
    expect(datos.tipoAcceso).toBe('comercial')
    expect(datos.modulos).toEqual(['reports'])
    expect(datos.reportes).toEqual(['laboratorio'])
    expect(datos.plantasAsignadas).toEqual([{ clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' }])
    expect(datos.area).toBeUndefined()
  })

  it('muestra el listado de módulos por categoría, pero solo deja dar lo que ya se acota a sus plantas', () => {
    render(<UsuarioForm usuario={comercial} onGuardar={() => {}} onCancelar={() => {}} />)
    for (const n of ['Data Core', 'Resultados y auditoría', 'AgroFresh Lab', 'Toma de muestras', 'Archivos']) {
      expect(screen.getByRole('region', { name: n })).toBeTruthy()
    }
    expect((report() as HTMLInputElement).disabled).toBe(false)
    expect((storage() as HTMLInputElement).checked).toBe(true)
    for (const n of [/^Panel de control interno/, /^Toma de solicitudes/]) {
      expect((screen.getByRole('checkbox', { name: n }) as HTMLInputElement).disabled).toBe(false)
    }
    expect((screen.getByRole('checkbox', { name: /^Crear reanálisis/ }) as HTMLInputElement).disabled).toBe(true)
    const converter = screen.getByRole('checkbox', { name: /^Converter/ }) as HTMLInputElement
    expect(converter.disabled).toBe(true)
    expect(converter.checked).toBe(false)
    expect(screen.getByText(/todavía no se pueden dar a un comercial/)).toBeTruthy()
    expect(screen.getAllByText('aún no disponible').length).toBeGreaterThan(5)
  })

  it('puede llevar los informes Accu-Tab (Postventa) junto al Report de laboratorio', () => {
    const postventa = () => screen.getByRole('checkbox', { name: /^Postventa/ }) as HTMLInputElement
    const onGuardar = guardar(comercial, () => {
      expect(postventa().disabled).toBe(false)
      fireEvent.click(postventa())
    })
    const datos = onGuardar.mock.calls[0][0] as Usuario
    expect(datos.modulos).toContain('reports')
    expect(datos.reportes).toEqual(['laboratorio', 'postventa'])
  })

  it('«Marcar todo» nunca marca lo que no está disponible para un comercial', () => {
    const onGuardar = guardar({ ...comercial, modulos: [], reportes: [] }, () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Data Core' })).getByRole('button', { name: 'Marcar todo' }))
      fireEvent.click(report())
    })
    const datos = onGuardar.mock.calls[0][0] as Usuario
    expect(datos.modulos).toEqual(['reports'])
  })

  it('no deja guardar un comercial sin plantas', () => {
    const onGuardar = guardar({ ...comercial, plantasAsignadas: [] })
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getAllByText(/al menos una planta/).length).toBeGreaterThan(0)
  })

  it('no deja guardar un comercial que no abre nada', () => {
    const onGuardar = guardar(comercial, () => {
      fireEvent.click(report())
      fireEvent.click(storage())
    })
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/Elige qué abre el comercial/)).toBeTruthy()
  })

  it('trae sus plantas de las listas de distribución, ordenadas por cliente, y se pueden quitar', async () => {
    buscar.mockResolvedValue([
      { clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' },
      { clienteNombre: 'VERFRUT', plantaNombre: 'VERFRUT RAPEL' },
    ])
    const onGuardar = vi.fn()
    render(<UsuarioForm usuario={comercial} onGuardar={onGuardar} onCancelar={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Traer sus plantas de las listas/ }))
    await waitFor(() => expect(screen.getByText('2 plantas en 2 clientes')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todo DOLE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect((onGuardar.mock.calls[0][0] as Usuario).plantasAsignadas).toEqual([{ clienteNombre: 'VERFRUT', plantaNombre: 'VERFRUT RAPEL' }])
  })
})
