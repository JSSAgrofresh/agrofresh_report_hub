import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsuarioForm } from './UsuarioForm'
import type { Usuario } from '../types'

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
    const onGuardar = guardar(cuenta, () => fireEvent.click(screen.getByRole('checkbox', { name: /Editar los criterios/ })))
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toContain('verif_criterios')
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
  })

  it('guardar un cliente con las dos vistas no manda área ni módulos', () => {
    const cliente: Usuario = { id: '5', email: 'c@dole.com', nombre: 'Dole', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.' }
    const onGuardar = guardar(cliente, () => fireEvent.click(screen.getByRole('checkbox', { name: /Informes Accu-Tab/ })))
    const datos = onGuardar.mock.calls[0][0] as Omit<Usuario, 'id'>
    expect(datos.reportes).toEqual(['laboratorio', 'postventa'])
    expect(datos.area).toBeUndefined()
    expect(datos.modulos).toBeUndefined()
  })

  it('no deja guardar un cliente sin nada que ver', () => {
    const cliente: Usuario = { id: '5', email: 'c@dole.com', nombre: 'Dole', tipoAcceso: 'cliente', clienteNombre: 'DOLE CHILE S.A.' }
    const onGuardar = guardar(cliente, () => fireEvent.click(screen.getByRole('checkbox', { name: /Report de laboratorio/ })))
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/Elige qué ve el cliente/)).toBeTruthy()
  })

  it('administrador general y gerencia ven todo sin poder cambiarlo', () => {
    render(<UsuarioForm usuario={{ ...cuenta, tipoAcceso: 'gerencia', area: undefined }} onGuardar={() => {}} onCancelar={() => {}} />)
    const box = screen.getByRole('checkbox', { name: /Storage/ }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Auditoría Interna/ }) as HTMLInputElement).checked).toBe(false)
  })
})
