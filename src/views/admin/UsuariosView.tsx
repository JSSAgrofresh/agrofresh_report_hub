import { useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  ClaveTemporalAviso,
  contarPorGrupo,
  filtrarUsuarios,
  GRUPOS_USUARIOS,
  regenerarPassword,
  UsuarioForm,
  UsuariosTable,
  useUsuarios,
} from '@/features/usuarios'
import type { GrupoUsuarios, Usuario, UsuarioCreado } from '@/features/usuarios'
import styles from './UsuariosView.module.css'

type Panel = { modo: 'lista' } | { modo: 'nuevo' } | { modo: 'editar'; usuario: Usuario }

export function UsuariosView() {
  const { usuarios, cargando, crear, actualizar, eliminar } = useUsuarios()
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [grupo, setGrupo] = useState<GrupoUsuarios>('todos')
  const [texto, setTexto] = useState('')
  const conteo = useMemo(() => contarPorGrupo(usuarios), [usuarios])
  const visibles = useMemo(() => filtrarUsuarios(usuarios, grupo, texto), [usuarios, grupo, texto])
  const hayFiltro = grupo !== 'todos' || texto.trim() !== ''
  // La contraseña recién generada. Se muestra una sola vez: el sistema guarda
  // su huella, no la contraseña, así que ni el backend puede repetirla.
  const [claveNueva, setClaveNueva] = useState<UsuarioCreado | null>(null)

  async function onGuardar(datos: Omit<Usuario, 'id'>) {
    try {
      if (panel.modo === 'editar') {
        await actualizar(panel.usuario.id, datos)
      } else {
        setClaveNueva(await crear(datos))
      }
      setPanel({ modo: 'lista' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar el usuario.')
    }
  }

  async function onRestablecer(usuario: Usuario) {
    if (
      !confirm(
        `¿Generar una contraseña nueva para ${usuario.nombre}?\n\n` +
          'La actual deja de servir y se cierran todas sus sesiones abiertas.',
      )
    )
      return
    try {
      setClaveNueva(await regenerarPassword(usuario.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.')
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
              <div className={styles.buscador}>
                <input
                  type="search"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Buscar por nombre, correo o cliente…"
                  aria-label="Buscar usuarios"
                />
              </div>
              <Button onClick={() => setPanel({ modo: 'nuevo' })}>Nuevo usuario</Button>
            </div>
            <div className={styles.filtros} role="group" aria-label="Filtrar por tipo de cuenta">
              {GRUPOS_USUARIOS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={grupo === g.id}
                  className={`${styles.filtro} ${grupo === g.id ? styles.filtroActivo : ''}`}
                  disabled={g.id !== 'todos' && conteo[g.id] === 0}
                  onClick={() => setGrupo(g.id)}
                >
                  {g.texto}
                  <b>{conteo[g.id]}</b>
                </button>
              ))}
            </div>
            <p className={styles.contador} aria-live="polite">
              {cargando
                ? 'Cargando usuarios…'
                : hayFiltro
                  ? `${visibles.length} de ${usuarios.length} usuarios`
                  : `${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'}`}
              {hayFiltro && (
                <button type="button" className={styles.limpiar} onClick={() => { setGrupo('todos'); setTexto('') }}>
                  Quitar filtros
                </button>
              )}
            </p>
            <UsuariosTable
              usuarios={visibles}
              vacio={hayFiltro ? 'Ningún usuario coincide con el filtro.' : undefined}
              onEditar={(usuario) => setPanel({ modo: 'editar', usuario })}
              onEliminar={onEliminar}
              onRestablecer={onRestablecer}
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

      {claveNueva && (
        <ClaveTemporalAviso creado={claveNueva} onCerrar={() => setClaveNueva(null)} />
      )}
    </div>
  )
}
