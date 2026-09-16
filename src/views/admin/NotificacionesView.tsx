import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { notificacionesApi } from '@/features/notificaciones'
import type { NotificacionAdmin, NotificacionIn, CategoriaNotificacion, AudienciaNotificacion } from '@/features/notificaciones'
import styles from './NotificacionesView.module.css'

const CATEGORIAS: { id: CategoriaNotificacion; label: string }[] = [
  { id: 'actualizacion', label: 'Actualización' },
  { id: 'sistema',       label: 'Sistema' },
  { id: 'cromatografia', label: 'Cromatografía' },
]

const AUDIENCIAS: { id: AudienciaNotificacion; label: string }[] = [
  { id: 'todos',          label: 'Todos los usuarios internos' },
  { id: 'admin_general',  label: 'Solo admin general' },
  { id: 'cromatografia',  label: 'Admin de cromatografía' },
]

const VACIO: NotificacionIn = {
  titulo: '',
  resumen: '',
  cuerpo: '',
  categoria: 'actualizacion',
  audiencia: 'todos',
  publicado: true,
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function NotificacionesView() {
  const [lista, setLista] = useState<NotificacionAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<NotificacionAdmin | null>(null)
  const [campos, setCampos] = useState<NotificacionIn>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function cargar() {
    notificacionesApi
      .adminListar()
      .then((data) => { setLista(data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  function abrirNuevo() {
    setEditando(null)
    setCampos(VACIO)
    setError('')
    setFormAbierto(true)
  }

  function abrirEditar(n: NotificacionAdmin) {
    setEditando(n)
    setCampos({
      titulo: n.titulo,
      resumen: n.resumen,
      cuerpo: n.cuerpo,
      categoria: n.categoria,
      audiencia: n.audiencia,
      publicado: n.publicado,
    })
    setError('')
    setFormAbierto(true)
  }

  function cerrarForm() {
    setFormAbierto(false)
    setEditando(null)
    setCampos(VACIO)
    setError('')
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!campos.titulo.trim() || !campos.resumen.trim()) {
      setError('El título y el resumen son obligatorios.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      if (editando) {
        const actualizada = await notificacionesApi.adminEditar(editando.id, campos)
        setLista((prev) => prev.map((n) => (n.id === actualizada.id ? { ...actualizada, leidas_por: n.leidas_por } : n)))
      } else {
        const nueva = await notificacionesApi.adminCrear(campos)
        setLista((prev) => [nueva, ...prev])
      }
      cerrarForm()
    } catch {
      setError('Error al guardar. Verifica los datos e inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(n: NotificacionAdmin) {
    if (!confirm(`¿Eliminar la notificación "${n.titulo}"? Esta acción no se puede deshacer.`)) return
    try {
      await notificacionesApi.adminEliminar(n.id)
      setLista((prev) => prev.filter((x) => x.id !== n.id))
    } catch {
      alert('No se pudo eliminar la notificación.')
    }
  }

  function set(key: keyof NotificacionIn, value: string | boolean) {
    setCampos((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className={styles.contenedor}>
      <div className={styles.header}>
        <h1 className={styles.headerTitulo}>Notificaciones</h1>
        <button type="button" className={styles.btnNuevo} onClick={abrirNuevo}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="2" y1="8" x2="14" y2="8" />
          </svg>
          Nueva notificación
        </button>
      </div>

      {/* Formulario */}
      {formAbierto && (
        <form className={styles.formCard} onSubmit={guardar}>
          <p className={styles.formTitulo}>
            {editando ? `Editando: ${editando.titulo}` : 'Nueva notificación'}
          </p>
          <div className={styles.campos}>
            <div className={cn(styles.campo, styles.campoFull)}>
              <label className={styles.label}>Título *</label>
              <input
                className={styles.input}
                value={campos.titulo}
                onChange={(e) => set('titulo', e.target.value)}
                placeholder="Título de la notificación"
                maxLength={180}
              />
            </div>

            <div className={cn(styles.campo, styles.campoFull)}>
              <label className={styles.label}>Resumen *</label>
              <input
                className={styles.input}
                value={campos.resumen}
                onChange={(e) => set('resumen', e.target.value)}
                placeholder="Descripción breve que aparece en la lista"
                maxLength={300}
              />
            </div>

            <div className={cn(styles.campo, styles.campoFull)}>
              <label className={styles.label}>Cuerpo (soporta **negrita**, *cursiva*, `código`, # Título)</label>
              <textarea
                className={styles.textarea}
                value={campos.cuerpo}
                onChange={(e) => set('cuerpo', e.target.value)}
                placeholder="Contenido completo de la notificación. Opcional si el resumen es suficiente."
              />
            </div>

            <div className={styles.campo}>
              <label className={styles.label}>Categoría</label>
              <select
                className={styles.select}
                value={campos.categoria}
                onChange={(e) => set('categoria', e.target.value)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.campo}>
              <label className={styles.label}>Audiencia</label>
              <select
                className={styles.select}
                value={campos.audiencia}
                onChange={(e) => set('audiencia', e.target.value)}
              >
                {AUDIENCIAS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>

            <div className={cn(styles.campo, styles.campoFull)}>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={campos.publicado}
                  onChange={(e) => set('publicado', e.target.checked)}
                />
                Publicada (visible para los usuarios)
              </label>
            </div>
          </div>

          <div className={styles.formAcciones}>
            {error && <span className={styles.errorMsg}>{error}</span>}
            <button type="button" className={styles.btnCancelar} onClick={cerrarForm}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnGuardar} disabled={guardando}>
              {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear notificación')}
            </button>
          </div>
        </form>
      )}

      {/* Tabla */}
      <div className={styles.card}>
        {cargando ? (
          <p className={styles.vacia}>Cargando…</p>
        ) : lista.length === 0 ? (
          <p className={styles.vacia}>No hay notificaciones creadas aún.</p>
        ) : (
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Resumen</th>
                <th>Categoría</th>
                <th>Audiencia</th>
                <th>Estado</th>
                <th>Leídas</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr key={n.id}>
                  <td className={styles.colTitulo}>{n.titulo}</td>
                  <td className={styles.colResumen}>{n.resumen}</td>
                  <td>
                    <span className={cn(styles.badge, styles[n.categoria as keyof typeof styles])}>
                      {CATEGORIAS.find((c) => c.id === n.categoria)?.label ?? n.categoria}
                    </span>
                  </td>
                  <td>
                    <span className={styles.badgeAudiencia}>
                      {AUDIENCIAS.find((a) => a.id === n.audiencia)?.label ?? n.audiencia}
                    </span>
                  </td>
                  <td>
                    <span className={cn(styles.badgePublicado, n.publicado ? styles.publicado : styles.borrador)}>
                      {n.publicado ? 'Publicada' : 'Borrador'}
                    </span>
                  </td>
                  <td className={styles.colFecha}>{n.leidas_por}</td>
                  <td className={styles.colFecha}>{formatFecha(n.creado_en)}</td>
                  <td>
                    <div className={styles.acciones}>
                      <button
                        type="button"
                        className={styles.btnEditar}
                        onClick={() => abrirEditar(n)}
                        title="Editar"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.btnEliminar}
                        onClick={() => eliminar(n)}
                        title="Eliminar"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 5h10M8 5V3M6 5v7M10 5v7M4 5l.5 8h7L12 5"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
