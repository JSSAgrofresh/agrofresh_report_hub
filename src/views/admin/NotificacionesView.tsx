import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { notificacionesApi, TIPOS_CUENTA, TODOS_LOS_TIPOS, destinoDe, resumenDestino } from '@/features/notificaciones'
import type { NotificacionAdmin, NotificacionIn, CategoriaNotificacion, TipoCuentaDestino } from '@/features/notificaciones'
import { SuscripcionesPanel } from './SuscripcionesPanel'
import styles from './NotificacionesView.module.css'

const CATEGORIAS: { id: CategoriaNotificacion; label: string }[] = [
  { id: 'actualizacion', label: 'Actualización' },
  { id: 'sistema',       label: 'Sistema' },
  { id: 'cromatografia', label: 'Cromatografía' },
]

const VACIO: NotificacionIn = {
  titulo: '',
  resumen: '',
  cuerpo: '',
  categoria: 'actualizacion',
  audiencia: 'todos',
  tipos_destino: [...TODOS_LOS_TIPOS],
  publicado: true,
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

type Pestana = 'avisos' | 'suscripciones'

export function NotificacionesView() {
  const [pestana, setPestana] = useState<Pestana>('avisos')
  const [lista, setLista] = useState<NotificacionAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<NotificacionAdmin | null>(null)
  const [campos, setCampos] = useState<NotificacionIn>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [probando, setProbando] = useState(false)
  const [avisoPrueba, setAvisoPrueba] = useState('')

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
      tipos_destino: destinoDe(n),
      publicado: n.publicado,
    })
    setError('')
    setFormAbierto(true)
  }

  /** Manda la notificación solo a quien la prueba: no se publica ni la ve nadie más. */
  async function probar() {
    if (!campos.titulo.trim() || !campos.resumen.trim()) {
      setError('Para probar, escribe al menos el título y el resumen.')
      return
    }
    if (!campos.tipos_destino?.length) {
      setError('Elige a quién va el aviso (al menos un tipo de cuenta).')
      return
    }
    setProbando(true)
    setError('')
    setAvisoPrueba('')
    try {
      await notificacionesApi.adminProbar(campos)
      setAvisoPrueba('Prueba enviada solo a ti. Ábrela en la campana, no la ve nadie más.')
    } catch {
      setError('No se pudo enviar la prueba. Inténtalo de nuevo.')
    } finally {
      setProbando(false)
    }
  }

  function cerrarForm() {
    setAvisoPrueba('')
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
    if (!campos.tipos_destino?.length) {
      setError('Elige a quién va el aviso (al menos un tipo de cuenta).')
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

  function alternarDestino(id: TipoCuentaDestino) {
    setCampos((prev) => {
      const actuales = prev.tipos_destino ?? []
      const tipos = actuales.includes(id) ? actuales.filter((t) => t !== id) : [...actuales, id]
      return { ...prev, tipos_destino: TODOS_LOS_TIPOS.filter((t) => tipos.includes(t)) }
    })
  }

  function set(key: keyof NotificacionIn, value: string | boolean) {
    setCampos((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className={cn(styles.contenedor, pestana === 'suscripciones' && styles.contenedorAncho)}>
      <div className={styles.header}>
        <h1 className={styles.headerTitulo}>Notificaciones</h1>
        {pestana === 'avisos' && (
          <button type="button" className={styles.btnNuevo} onClick={abrirNuevo}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14">
              <line x1="8" y1="2" x2="8" y2="14" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            Nueva notificación
          </button>
        )}
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'avisos'}
          className={cn(styles.tab, pestana === 'avisos' && styles.tabActiva)}
          onClick={() => setPestana('avisos')}
        >
          Avisos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'suscripciones'}
          className={cn(styles.tab, pestana === 'suscripciones' && styles.tabActiva)}
          onClick={() => setPestana('suscripciones')}
        >
          Quién recibe qué
        </button>
      </div>

      {pestana === 'suscripciones' ? (
        <SuscripcionesPanel />
      ) : (
        <>
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

                <fieldset className={cn(styles.campo, styles.campoFull, styles.destino)}>
                  <legend className={styles.label}>A quién va *</legend>
                  <div className={styles.destinoOpciones}>
                    {TIPOS_CUENTA.map((t) => (
                      <label key={t.id} className={styles.checkRow}>
                        <input
                          type="checkbox"
                          checked={campos.tipos_destino?.includes(t.id) ?? false}
                          onChange={() => alternarDestino(t.id)}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  <p className={styles.destinoNota}>
                    Los clientes no reciben avisos.{' '}
                    <button
                      type="button"
                      className={styles.enlace}
                      onClick={() => setCampos((p) => ({ ...p, tipos_destino: [...TODOS_LOS_TIPOS] }))}
                    >
                      Marcar todos
                    </button>
                  </p>
                </fieldset>

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
                {avisoPrueba && <span className={styles.avisoPrueba} role="status">{avisoPrueba}</span>}
                <button type="button" className={styles.btnProbar} onClick={probar} disabled={probando}>
                  {probando ? 'Enviando…' : 'Probar notificación'}
                </button>
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
                          {resumenDestino(destinoDe(n))}
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
        </>
      )}
    </div>
  )
}
