import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearAnalisis, actualizarAnalisis, eliminarAnalisis, MODOS_ANALISIS } from '@/features/laboratorios'
import type { Analisis, AnalisisInput, AnalitoDeAnalisis, ModoAnalisis, Unidad } from '@/features/laboratorios'
import type { AnalitoConfig } from '@/features/tomaMuestras'
import styles from './LaboratoriosView.module.css'

interface AnalisisPanelProps {
  laboratorio: string
  analisis: Analisis[]
  /** Los analitos del laboratorio, del mantenedor de Toma de muestras: un
   * análisis los agrupa, no los redefine. */
  analitos: AnalitoConfig[]
  unidades: Unidad[]
  onCambio: (analisis: Analisis[]) => void
  onError: (mensaje: string | null) => void
}

interface Borrador {
  nombre: string
  observaciones: string
  modo: ModoAnalisis
  elegidos: Map<number, AnalitoDeAnalisis>
}

function borradorVacio(): Borrador {
  return { nombre: '', observaciones: '', modo: 'seleccionable', elegidos: new Map() }
}

function borradorDe(a: Analisis): Borrador {
  return {
    nombre: a.nombre,
    observaciones: a.observaciones,
    modo: a.modo,
    elegidos: new Map(a.analitos.map((x) => [x.analito_id, x])),
  }
}

export function AnalisisPanel({
  laboratorio,
  analisis,
  analitos,
  unidades,
  onCambio,
  onError,
}: AnalisisPanelProps) {
  const [editorAbierto, setEditorAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio())
  const [guardando, setGuardando] = useState(false)

  const analitosActivos = useMemo(
    () => analitos.filter((a) => a.activo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.orden - b.orden),
    [analitos],
  )
  const unidadesActivas = useMemo(
    () => unidades.filter((u) => u.activo).sort((a, b) => a.orden - b.orden),
    [unidades],
  )
  const porId = useMemo(() => new Map(analitos.map((a) => [a.id, a])), [analitos])

  function abrirNuevo() {
    setEditandoId(null)
    setBorrador(borradorVacio())
    setEditorAbierto(true)
    onError(null)
  }

  function abrirEdicion(a: Analisis) {
    setEditandoId(a.id)
    setBorrador(borradorDe(a))
    setEditorAbierto(true)
    onError(null)
  }

  function cerrar() {
    setEditorAbierto(false)
    setEditandoId(null)
    setBorrador(borradorVacio())
  }

  function alternarAnalito(analito: AnalitoConfig) {
    const elegidos = new Map(borrador.elegidos)
    if (elegidos.has(analito.id)) {
      elegidos.delete(analito.id)
    } else {
      // La unidad que ya trae el analito es el mejor punto de partida; si no
      // está en el mantenedor de unidades, queda vacía para elegirla a mano.
      const sugerida = unidadesActivas.find((u) => u.simbolo === analito.unidad)?.simbolo ?? ''
      elegidos.set(analito.id, { analito_id: analito.id, unidad: sugerida, preseleccionado: true })
    }
    setBorrador({ ...borrador, elegidos })
  }

  function cambiarUnidad(analitoId: number, unidad: string) {
    const elegidos = new Map(borrador.elegidos)
    const actual = elegidos.get(analitoId)
    if (!actual) return
    elegidos.set(analitoId, { ...actual, unidad })
    setBorrador({ ...borrador, elegidos })
  }

  function todos() {
    const elegidos = new Map(borrador.elegidos)
    for (const a of analitosActivos) {
      if (!elegidos.has(a.id)) {
        const sugerida = unidadesActivas.find((u) => u.simbolo === a.unidad)?.simbolo ?? ''
        elegidos.set(a.id, { analito_id: a.id, unidad: sugerida, preseleccionado: true })
      }
    }
    setBorrador({ ...borrador, elegidos })
  }

  function ninguno() {
    setBorrador({ ...borrador, elegidos: new Map() })
  }

  async function guardar() {
    if (!borrador.nombre.trim()) {
      onError('El análisis necesita un nombre.')
      return
    }
    if (borrador.elegidos.size === 0) {
      onError('Elige al menos un analito para este análisis.')
      return
    }
    const base = editandoId != null ? analisis.find((a) => a.id === editandoId) : undefined
    const datos: AnalisisInput = {
      laboratorio,
      nombre: borrador.nombre.trim(),
      observaciones: borrador.observaciones.trim(),
      modo: borrador.modo,
      analitos: [...borrador.elegidos.values()],
      activo: base?.activo ?? true,
      orden: base?.orden ?? analisis.length + 1,
    }
    setGuardando(true)
    onError(null)
    try {
      if (base) {
        const actualizado = await actualizarAnalisis(base.id, datos)
        onCambio(analisis.map((a) => (a.id === base.id ? actualizado : a)))
      } else {
        const nuevo = await crearAnalisis(datos)
        onCambio([...analisis, nuevo])
      }
      cerrar()
    } catch {
      onError('No se pudo guardar el análisis.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(a: Analisis) {
    if (!window.confirm(`¿Eliminar el análisis "${a.nombre}"?`)) return
    onError(null)
    try {
      await eliminarAnalisis(a.id)
      onCambio(analisis.filter((x) => x.id !== a.id))
    } catch {
      onError('No se pudo eliminar el análisis.')
    }
  }

  async function alternarActivo(a: Analisis) {
    onError(null)
    try {
      const { id, ...datos } = a
      const actualizado = await actualizarAnalisis(id, { ...datos, activo: !a.activo })
      onCambio(analisis.map((x) => (x.id === id ? actualizado : x)))
    } catch {
      onError('No se pudo cambiar el estado del análisis.')
    }
  }

  const ordenados = [...analisis].sort((a, b) => a.orden - b.orden)

  return (
    <section className={styles.seccion}>
      <div className={styles.seccionCabecera}>
        <div>
          <h3 className={styles.seccionTitulo}>Análisis del laboratorio</h3>
          <p className={styles.seccionNota}>
            Cada análisis agrupa los analitos que el laboratorio informa, con la unidad de cada uno.
          </p>
        </div>
        {!editorAbierto && <Button onClick={abrirNuevo}>Nuevo análisis</Button>}
      </div>

      {editorAbierto && (
        <div className={styles.formulario}>
          <div className={styles.formGrilla}>
            <div className={cn(styles.campo, styles.campoAncho)}>
              <label className={styles.etiqueta}>Nombre del análisis</label>
              <input
                className={styles.input}
                value={borrador.nombre}
                autoFocus
                placeholder="Multiresiduo fungicidas"
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
              />
            </div>
            <div className={cn(styles.campo, styles.campoAncho)}>
              <label className={styles.etiqueta}>Observaciones</label>
              <textarea
                className={styles.textarea}
                value={borrador.observaciones}
                placeholder="Notas de método, tiempos de entrega, requisitos de la muestra…"
                onChange={(e) => setBorrador({ ...borrador, observaciones: e.target.value })}
              />
            </div>
            <div className={cn(styles.campo, styles.campoAncho)}>
              <label className={styles.etiqueta}>Modo</label>
              <select
                className={styles.select}
                value={borrador.modo}
                onChange={(e) => setBorrador({ ...borrador, modo: e.target.value as ModoAnalisis })}
              >
                {MODOS_ANALISIS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta} — {m.descripcion}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.campo}>
            <label className={styles.etiqueta}>
              Analitos incluidos ({borrador.elegidos.size} de {analitosActivos.length})
            </label>
            <div className={styles.barraSeleccion}>
              <span>
                {borrador.modo === 'completo'
                  ? 'Todos los analitos marcados entran siempre en este análisis.'
                  : 'Los marcados como preseleccionados vienen activados al pedir el análisis.'}
              </span>
              <span>
                <button type="button" className={styles.enlaceAccion} onClick={todos}>
                  Marcar todos
                </button>
                {' · '}
                <button type="button" className={styles.enlaceAccion} onClick={ninguno}>
                  Ninguno
                </button>
              </span>
            </div>

            {analitosActivos.length === 0 ? (
              <div className={styles.vacio}>
                <span className={styles.vacioTitulo}>Este laboratorio no tiene analitos</span>
                <span className={styles.vacioNota}>Agrégalos en la pestaña Analitos y vuelve acá.</span>
              </div>
            ) : (
              <div className={styles.selectorAnalitos}>
                {analitosActivos.map((a) => {
                  const elegido = borrador.elegidos.get(a.id)
                  return (
                    <div key={a.id} className={cn(styles.analitoFila, elegido && styles.analitoFilaElegida)}>
                      <label className={styles.analitoCheck}>
                        <input type="checkbox" checked={!!elegido} onChange={() => alternarAnalito(a)} />
                        <span>
                          <span className={styles.analitoNombre}>{a.nombre}</span>{' '}
                          <span className={styles.analitoCodigo}>{a.codigo}</span>
                        </span>
                      </label>
                      <select
                        className={styles.selectUnidad}
                        value={elegido?.unidad ?? ''}
                        disabled={!elegido}
                        onChange={(e) => cambiarUnidad(a.id, e.target.value)}
                      >
                        <option value="">Sin unidad</option>
                        {unidadesActivas.map((u) => (
                          <option key={u.id} value={u.simbolo}>
                            {u.simbolo}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={styles.formAcciones}>
            <Button variant="secondary" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : editandoId != null ? 'Guardar cambios' : 'Crear análisis'}
            </Button>
          </div>
        </div>
      )}

      {ordenados.length === 0 && !editorAbierto ? (
        <div className={styles.vacio}>
          <span className={styles.vacioTitulo}>Todavía no hay análisis</span>
          <span className={styles.vacioNota}>
            Crea el primero para definir qué le puedes pedir a este laboratorio.
          </span>
        </div>
      ) : (
        <div className={styles.analisisGrilla}>
          {ordenados.map((a) => {
            const modo = MODOS_ANALISIS.find((m) => m.valor === a.modo)
            return (
              <article key={a.id} className={styles.analisisTarjeta}>
                <div className={styles.analisisCabecera}>
                  <div style={{ minWidth: 0 }}>
                    <h4 className={styles.analisisNombre}>{a.nombre}</h4>
                    {a.observaciones && <p className={styles.analisisObs}>{a.observaciones}</p>}
                  </div>
                  <div className={styles.filaAcciones}>
                    <button
                      className={styles.iconoBoton}
                      title={a.activo ? 'Desactivar' : 'Activar'}
                      onClick={() => alternarActivo(a)}
                    >
                      {a.activo ? '◉' : '○'}
                    </button>
                    <button className={styles.iconoBoton} title="Editar" onClick={() => abrirEdicion(a)}>
                      ✎
                    </button>
                    <button
                      className={cn(styles.iconoBoton, styles.iconoBotonPeligro)}
                      title="Eliminar"
                      onClick={() => borrar(a)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className={styles.chips}>
                  <span
                    className={cn(
                      styles.insignia,
                      a.modo === 'completo' ? styles.insigniaCompleto : styles.insigniaSeleccionable,
                    )}
                  >
                    {modo?.etiqueta ?? a.modo}
                  </span>
                  {!a.activo && <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactivo</span>}
                </div>

                <div className={styles.chips}>
                  {a.analitos.length === 0 ? (
                    <span className={styles.chipVacio}>Sin analitos asignados</span>
                  ) : (
                    a.analitos.map((x) => {
                      const analito = porId.get(x.analito_id)
                      return (
                        <span key={x.analito_id} className={styles.chip}>
                          {analito?.nombre ?? `#${x.analito_id}`}
                          {x.unidad && <span className={styles.chipUnidad}>{x.unidad}</span>}
                        </span>
                      )
                    })
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
