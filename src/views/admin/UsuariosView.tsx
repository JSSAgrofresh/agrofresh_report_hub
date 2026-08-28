import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { UsuarioForm, UsuariosTable, useUsuarios } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './UsuariosView.module.css'

type Panel = { modo: 'lista' } | { modo: 'nuevo' } | { modo: 'editar'; usuario: Usuario }

export function UsuariosView() {
  const { usuarios, cargando, crear, actualizar, eliminar } = useUsuarios()
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })

  async function onGuardar(datos: Omit<Usuario, 'id'>) {
    try {
      if (panel.modo === 'editar') {
        await actualizar(panel.usuario.id, datos)
      } else {
        await crear(datos)
      }
      setPanel({ modo: 'lista' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar el usuario.')
    }
  }

  async function onEliminar(usuario: Usuario) {
    if (!confirm(`¿Eliminar a ${usuario.nombre}? Esta acción no se puede deshacer.`)) return
    try {
      await eliminar(usuario.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el usuario.')
    }
  }

  return (
    <div>
      <Header
        title="Usuarios"
        description="Crea, edita y asigna el tipo de acceso de cada usuario del sistema."
      />

      <Card>
        {panel.modo === 'lista' ? (
          <>
            <div className={styles.cabeceraTabla}>
              <p className={styles.contador}>
                {cargando
                  ? 'Cargando usuarios…'
                  : `${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'}`}
              </p>
              <Button onClick={() => setPanel({ modo: 'nuevo' })}>Nuevo usuario</Button>
            </div>
            <UsuariosTable
              usuarios={usuarios}
              onEditar={(usuario) => setPanel({ modo: 'editar', usuario })}
              onEliminar={onEliminar}
            />
          </>
        ) : (
          <UsuarioForm
            usuario={panel.modo === 'editar' ? panel.usuario : undefined}
            onGuardar={onGuardar}
            onCancelar={() => setPanel({ modo: 'lista' })}
          />
        )}
      </Card>
    </div>
  )
}
