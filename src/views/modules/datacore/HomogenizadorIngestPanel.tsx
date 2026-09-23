import { useRef, useState } from 'react'
import {
  analizarExcel,
  cancelarIngesta,
  confirmarIngesta,
} from '@/features/homogenizadorIngesta'
import type { AnalisisIngesta, ResumenIngesta } from '@/features/homogenizadorIngesta'
import styles from './HomogenizadorIngestPanel.module.css'

type Col = 'sold_to' | 'ship_to' | 'especie' | 'variedad'

const COLUMNAS: Col[] = ['sold_to', 'ship_to', 'especie', 'variedad']

const ETIQUETAS: Record<Col, string> = {
  sold_to: 'Sold To',
  ship_to: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

interface Celda {
  id: string
  col: Col
  original: string
  filas: number
  value: string
  method: '' | 'manual' | 'automatico'
  candidates: { valor: string; confianza: number }[]
}

type Snapshot = Pick<Celda, 'id' | 'value' | 'method' | 'candidates'>[]

function initCeldas(analisis: AnalisisIngesta): Celda[] {
  return COLUMNAS.flatMap((col) =>
    analisis.columnas[col].map((v) => {
      const auto = v.automatico && !!v.sugerencia_auto
      return {
        id: `${col}||${v.valor_crudo}`,
        col,
        original: v.valor_crudo,
        filas: v.filas,
        value: auto ? v.sugerencia_auto! : '',
        method: auto ? ('automatico' as const) : '',
        candidates: auto ? [] : (v.sugerencias ?? []),
      }
    }),
  )
}

function canonicosDeCol(celdas: Celda[], col: Col): string[] {
  const set = new Set<string>()
  for (const c of celdas.filter((x) => x.col === col)) {
    if (c.value) set.add(c.value)
    for (const s of c.candidates) set.add(s.valor)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function HomogenizadorIngestPanel() {
  const [etapa, setEtapa] = useState<'subir' | 'mapear' | 'listo'>('subir')
  const [analisis, setAnalisis] = useState<AnalisisIngesta | null>(null)
  const [celdas, setCeldas] = useState<Celda[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Snapshot[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroCol, setFiltroCol] = useState<Col | 'all'>('all')
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'pending' | 'mapped' | 'review'>('all')
  const [multiselect, setMultiselect] = useState(false)
  const [revisarAbierto, setRevisarAbierto] = useState(false)
  const [dragIds, setDragIds] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenIngesta | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function mostrarToast(msg: string) {
    setToast(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(''), 4500)
  }

  function checkpoint(cs: Celda[]) {
    const snap: Snapshot = cs.map((c) => ({
      id: c.id,
      value: c.value,
      method: c.method,
      candidates: [...c.candidates],
    }))
    setHistory((h) => [...h.slice(-29), snap])
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h
      const snap = h[h.length - 1]
      const snapMap = new Map(snap.map((s) => [s.id, s]))
      setCeldas((cs) =>
        cs.map((c) => {
          const s = snapMap.get(c.id)
          return s ? { ...c, ...s } : c
        }),
      )
      setSelected(new Set())
      mostrarToast('Última operación deshecha.')
      return h.slice(0, -1)
    })
  }

  async function onSubir(archivo: File) {
    setCargando(true)
    setError(null)
    try {
      const r = await analizarExcel(archivo)
      setCeldas(initCeldas(r))
      setAnalisis(r)
      setEtapa('mapear')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el archivo.')
    } finally {
      setCargando(false)
    }
  }

  function asociar(ids: string[], col: Col, value: string) {
    if (!ids.length) {
      mostrarToast('Selecciona primero una o más celdas.')
      return
    }
    const targets = celdas.filter((c) => ids.includes(c.id))
    if (targets.some((c) => c.col !== col)) {
      mostrarToast(`Selecciona solo celdas de ${ETIQUETAS[col]} para asociarlas a este valor.`)
      return
    }
    checkpoint(celdas)
    setCeldas((cs) =>
      cs.map((c) =>
        ids.includes(c.id) ? { ...c, value, method: 'manual', candidates: [] } : c,
      ),
    )
    setSelected(new Set())
    mostrarToast(
      `${targets.length} ${targets.length === 1 ? 'celda asociada' : 'celdas asociadas'} a "${value}"`,
    )
  }

  function quitarAsociacion(ids: string[]) {
    checkpoint(celdas)
    setCeldas((cs) =>
      cs.map((c) => (ids.includes(c.id) ? { ...c, value: '', method: '' } : c)),
    )
    setSelected(new Set())
    mostrarToast('Asociaciones eliminadas; originales conservados.')
  }

  function smartMatch() {
    checkpoint(celdas)
    let auto = 0
    let review = 0
    const next = celdas.map((c) => {
      if (c.value || !c.candidates.length) return c
      const [top, second] = c.candidates
      if (!top || top.confianza < 0.85) return c
      const gap = second ? top.confianza - second.confianza : 1
      if (gap > 0.05) {
        auto++
        return { ...c, value: top.valor, method: 'automatico' as const, candidates: [] }
      }
      review++
      return c
    })
    setCeldas(next)
    setSelected(new Set())
    mostrarToast(`${auto} asociaciones automáticas · ${review} celdas para revisar.`)
    if (review) setRevisarAbierto(true)
  }

  async function confirmar() {
    if (!analisis) return
    setCargando(true)
    setError(null)
    try {
      const buildMapeo = (col: Col) =>
        Object.fromEntries(celdas.filter((c) => c.col === col).map((c) => [c.original, c.value]))
      const r = await confirmarIngesta(analisis.token, {
        sold_to: buildMapeo('sold_to'),
        ship_to: buildMapeo('ship_to'),
        especie: buildMapeo('especie'),
        variedad: buildMapeo('variedad'),
      })
      setResumen(r)
      setEtapa('listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ingestar.')
    } finally {
      setCargando(false)
    }
  }

  async function cancelar() {
    if (analisis?.token) {
      try {
        await cancelarIngesta(analisis.token)
      } catch {
        /* ignorar */
      }
    }
    setEtapa('subir')
    setAnalisis(null)
    setCeldas([])
    setSelected(new Set())
    setHistory([])
    setResumen(null)
    setError(null)
  }

  const totalCeldas = celdas.length
  const totalMapped = celdas.filter((c) => c.value).length
  const totalReview = celdas.filter((c) => !c.value && c.candidates.length > 0).length
  const totalPending = celdas.filter((c) => !c.value).length

  function visible(c: Celda): boolean {
    const q = normalizar(busqueda)
    const matchSearch = !q || normalizar(c.original).includes(q)
    const matchCol = filtroCol === 'all' || c.col === filtroCol
    const matchStatus =
      filtroEstado === 'all' ||
      (filtroEstado === 'mapped' && !!c.value) ||
      (filtroEstado === 'pending' && !c.value && !c.candidates.length) ||
      (filtroEstado === 'review' && c.candidates.length > 0)
    return matchSearch && matchCol && matchStatus
  }

  // ════════════════════════════════════════════════
  //  ETAPA 1: Subir
  // ════════════════════════════════════════════════
  if (etapa === 'subir') {
    return (
      <div className={styles.subirRoot}>
        <div className={styles.eyebrow}>Ingesta de Datos</div>
        <h1 className={styles.subirH1}>Del Excel a la base de datos.</h1>
        <p className={styles.subirIntro}>
          Sube el archivo de resultados. Antes de que nada entre a la base, revisarás los valores de{' '}
          <strong>Sold To</strong>, <strong>Ship To</strong>, <strong>Especie</strong> y{' '}
          <strong>Variedad</strong> y confirmarás a qué valores oficiales corresponden.
        </p>
        <div
          className={styles.zona}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) void onSubir(f)
          }}
          onClick={() => inputRef.current?.click()}
        >
          {cargando ? (
            <span className={styles.zonaCargando}>Analizando archivo…</span>
          ) : (
            <>
              <span className={styles.zonaIcono}>📂</span>
              <span>Arrastra el Excel aquí, o haz clic para seleccionarlo</span>
              <span className={styles.zonaHint}>.xlsx</span>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onSubir(f)
          }}
        />
        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
    )
  }

  // ════════════════════════════════════════════════
  //  ETAPA 3: Listo
  // ════════════════════════════════════════════════
  if (etapa === 'listo' && resumen) {
    const stats: [number, string][] = [
      [resumen.solicitudes_nuevas, 'solicitudes nuevas'],
      [resumen.solicitudes_existentes, 'ya existían'],
      [resumen.resultados, 'resultados'],
      [resumen.filas_omitidas ?? 0, 'filas omitidas'],
    ]
    if ((resumen.pendientes_revision ?? 0) > 0) {
      stats.push([resumen.pendientes_revision, 'pendientes de revisión'])
    }
    return (
      <div className={styles.listoRoot}>
        <div className={styles.listoIcono}>✓</div>
        <h2 className={styles.listoTitulo}>Datos ingresados correctamente</h2>
        <div className={styles.resumeGrid}>
          {stats.map(([n, label]) => (
            <div key={label} className={styles.resumeStat}>
              <strong className={styles.resumeNum}>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => void cancelar()}>
          Cargar otro archivo
        </button>
      </div>
    )
  }

  // ════════════════════════════════════════════════
  //  ETAPA 2: Mapear
  // ════════════════════════════════════════════════
  if (!analisis) return null

  const selectedArr = [...selected]
  const visibleCols = filtroCol === 'all' ? COLUMNAS : [filtroCol as Col]

  return (
    <div className={`${styles.mapearRoot} ${dragIds.length ? styles.dragging : ''}`}>
      {/* ── Barra de acción ── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => void cancelar()}
            disabled={cargando}
          >
            ← Cambiar archivo
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={undo}
            disabled={!history.length || cargando}
          >
            ↶ Deshacer
          </button>
        </div>
        <div className={styles.topRight}>
          {error && <span className={styles.errorMsg}>{error}</span>}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void confirmar()}
            disabled={cargando}
          >
            {cargando ? 'Procesando…' : 'Ingestar a la base de datos'}
          </button>
        </div>
      </div>

      {/* ── Layout: aside + main ── */}
      <div className={styles.layout}>
        {/* Aside: diccionario maestro */}
        <aside className={styles.aside}>
          <div className={styles.asideIntro}>
            <div className={styles.eyebrow}>01 / Diccionario maestro</div>
            <h2 className={styles.asideH2}>Un nombre para cada dato.</h2>
            <p className={styles.hint}>
              Arrastra celdas a su valor correcto. También puedes seleccionarlas y pulsar un valor
              aquí.
            </p>
          </div>
          {COLUMNAS.map((col) => {
            const canonicos = canonicosDeCol(celdas, col)
            if (!canonicos.length) return null
            const dimmed = filtroCol !== 'all' && filtroCol !== col
            return (
              <section
                key={col}
                className={`${styles.canonicalGroup} ${dimmed ? styles.canonicalGroupDimmed : ''}`}
              >
                <div className={styles.groupTitle}>
                  <span>{ETIQUETAS[col]}</span>
                  <span>{canonicos.length}</span>
                </div>
                {canonicos.map((name) => {
                  const count = celdas.filter((c) => c.col === col && c.value === name).length
                  const incompatible =
                    selected.size > 0 &&
                    selectedArr.some((id) => {
                      const c = celdas.find((x) => x.id === id)
                      return c && c.col !== col
                    })
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`${styles.canonical} ${incompatible ? styles.canonicalIncompatible : ''}`}
                      title={`Asociar selección a "${name}"`}
                      onClick={() => {
                        if (selected.size > 0) asociar(selectedArr, col, name)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        const valid = dragIds.every(
                          (id) => celdas.find((x) => x.id === id)?.col === col,
                        )
                        e.dataTransfer.dropEffect = valid ? 'copy' : 'none'
                        e.currentTarget.classList.add(styles.canonicalOver)
                      }}
                      onDragLeave={(e) => e.currentTarget.classList.remove(styles.canonicalOver)}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.currentTarget.classList.remove(styles.canonicalOver)
                        asociar(dragIds, col, name)
                      }}
                    >
                      <span>{name}</span>
                      <small>{count}</small>
                    </button>
                  )
                })}
              </section>
            )
          })}
        </aside>

        {/* Main area */}
        <main className={styles.main}>
          <div className={styles.eyebrow}>02 / Mesa de trabajo</div>
          <h1 className={styles.mainH1}>Del ruido a la claridad.</h1>
          <p className={styles.mainIntro}>
            Agrupa las variantes, conserva el origen y confirma cada dato antes de ingestar.
          </p>

          {/* Stats */}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.eyebrow}>Celdas de origen</div>
              <strong className={styles.statNum}>{totalCeldas}</strong>
              <small className={styles.statSub}>
                {analisis.total_filas} filas · {COLUMNAS.length} categorías
              </small>
            </div>
            <div className={styles.stat}>
              <div className={styles.eyebrow}>Homogeneizadas</div>
              <strong className={styles.statNum}>{totalMapped}</strong>
              <div className={styles.progress}>
                <i
                  style={{
                    width: `${totalCeldas ? Math.round((totalMapped / totalCeldas) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className={styles.stat}>
              <div className={styles.eyebrow}>Por resolver</div>
              <strong className={styles.statNum}>{totalPending}</strong>
              <small className={styles.statSub}>
                {totalReview > 0
                  ? `${totalReview} celdas requieren revisión`
                  : totalCeldas > 0
                    ? `${Math.round((totalMapped / totalCeldas) * 100)}% de avance`
                    : 'Todo listo para empezar'}
              </small>
            </div>
          </div>

          {/* Workspace */}
          <div className={styles.workspace}>
            {/* Tools */}
            <div className={styles.tools}>
              <label className={styles.search}>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Buscar caracteres en los originales…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </label>
              <select
                value={filtroCol}
                onChange={(e) => {
                  setFiltroCol(e.target.value as Col | 'all')
                  setSelected(new Set())
                }}
              >
                <option value="all">Todas las categorías</option>
                {COLUMNAS.map((col) => (
                  <option key={col} value={col}>
                    {ETIQUETAS[col]}
                  </option>
                ))}
              </select>
              <select
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value as typeof filtroEstado)
                  setSelected(new Set())
                }}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="mapped">Homogeneizadas</option>
                <option value="review">Por revisar</option>
              </select>
              <button type="button" className={styles.btnSmart} onClick={smartMatch}>
                ✦ Cruce inteligente · 85%
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setRevisarAbierto(true)}
              >
                Revisar <span>{totalReview}</span>
              </button>
            </div>

            {/* Selection bar */}
            <div className={styles.selectionBar}>
              <span>
                {selected.size > 0
                  ? `${selected.size} ${selected.size === 1 ? 'celda seleccionada' : 'celdas seleccionadas'} · arrastra o pulsa un valor del diccionario`
                  : 'Selecciona una celda para empezar'}
              </span>
              <div className={styles.selectionActions}>
                <label>
                  <input
                    type="checkbox"
                    checked={multiselect}
                    onChange={(e) => setMultiselect(e.target.checked)}
                  />
                  {' '}Multiselección
                </label>
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => {
                    const visibles = celdas.filter(visible)
                    setSelected(new Set(visibles.map((c) => c.id)))
                    const cols = new Set(visibles.map((c) => c.col))
                    if (cols.size > 1) {
                      mostrarToast(
                        'La selección incluye varias categorías. Filtra una categoría para asociar en masa.',
                      )
                    }
                  }}
                >
                  Seleccionar visibles
                </button>
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={!selected.size}
                  onClick={() => setSelected(new Set())}
                >
                  Limpiar selección
                </button>
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={!selected.size}
                  onClick={() => {
                    const targets = selectedArr
                      .map((id) => celdas.find((c) => c.id === id))
                      .filter(Boolean)
                    if (!targets.some((c) => c!.value || c!.candidates.length)) {
                      mostrarToast('Estas celdas aún no tienen asociación.')
                      return
                    }
                    quitarAsociacion(selectedArr)
                  }}
                >
                  Quitar asociación
                </button>
              </div>
            </div>

            {/* Board */}
            <div
              className={styles.board}
              style={filtroCol !== 'all' ? { gridTemplateColumns: '1fr' } : undefined}
            >
              {visibleCols.map((col) => {
                const lista = celdas.filter((c) => c.col === col && visible(c))
                return (
                  <section key={col} className={styles.column}>
                    <div className={styles.colHead}>
                      <span>{ETIQUETAS[col]}</span>
                      <span className={styles.colCount}>{lista.length} celdas</span>
                    </div>
                    <div className={styles.cells}>
                      {lista.length === 0 ? (
                        <div className={styles.empty}>
                          No hay celdas con estos filtros. Prueba otra búsqueda.
                        </div>
                      ) : (
                        lista.map((c) => {
                          const isSelected = selected.has(c.id)
                          return (
                            <button
                              key={c.id}
                              type="button"
                              draggable
                              className={`${styles.cell} ${isSelected ? styles.cellSelected : ''} ${c.value ? styles.cellMapped : ''}`}
                              title={`${c.original} · ${ETIQUETAS[col]}`}
                              aria-pressed={isSelected}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey || multiselect) {
                                  setSelected((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(c.id)) { next.delete(c.id) } else { next.add(c.id) }
                                    return next
                                  })
                                } else {
                                  setSelected(new Set([c.id]))
                                }
                              }}
                              onDragStart={(e) => {
                                const ids = selected.has(c.id) ? [...selected] : [c.id]
                                setDragIds(ids)
                                if (!selected.has(c.id)) setSelected(new Set([c.id]))
                                e.dataTransfer.setData('text/plain', JSON.stringify(ids))
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onDragEnd={() => setDragIds([])}
                            >
                              <b>{c.original || <em>(vacío)</em>}</b>
                              <small className={styles.cellMeta}>
                                <span>
                                  {c.filas} {c.filas === 1 ? 'fila' : 'filas'}
                                </span>
                                <span>{c.value ? '✓' : c.candidates.length ? '◇' : '○'}</span>
                              </small>
                              <small
                                className={
                                  c.value
                                    ? styles.cellResult
                                    : c.candidates.length
                                      ? styles.cellAmbiguous
                                      : styles.cellEmpty
                                }
                              >
                                {c.value
                                  ? `→ ${c.value}`
                                  : c.candidates.length
                                    ? 'Revisar coincidencia'
                                    : 'Sin asociación'}
                              </small>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </section>
                )
              })}
            </div>

            <div className={styles.legend}>
              ○ Pendiente &nbsp;·&nbsp; ✓ Homogeneizada &nbsp;·&nbsp; ◇ Revisión &nbsp;|&nbsp; Las
              filas sin asociación se descartan al ingestar.
            </div>
          </div>
        </main>
      </div>

      {/* ── Diálogo de revisión ── */}
      {revisarAbierto && (
        <div className={styles.dialogBackdrop} onClick={() => setRevisarAbierto(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <div>
                <div className={styles.eyebrow}>Control de calidad</div>
                <h2 className={styles.dialogH2}>Coincidencias por revisar</h2>
              </div>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setRevisarAbierto(false)}
                aria-label="Cerrar revisión"
              >
                ✕
              </button>
            </div>
            <p className={styles.hint}>
              Hay más de un nombre parecido. Elige el correcto o déjalo pendiente para asociarlo
              manualmente.
            </p>
            <div className={styles.reviewList}>
              {(() => {
                const ambiguous = celdas.filter((c) => c.candidates.length > 0 && !c.value)
                if (!ambiguous.length)
                  return (
                    <p className={styles.hint}>
                      No quedan coincidencias ambiguas. Puedes seguir con las celdas pendientes.
                    </p>
                  )
                return ambiguous.map((c) => (
                  <div key={c.id} className={styles.reviewItem}>
                    <div className={styles.eyebrow}>
                      {ETIQUETAS[c.col]} · {c.filas} {c.filas === 1 ? 'fila' : 'filas'}
                    </div>
                    <h3 className={styles.reviewOriginal}>{c.original}</h3>
                    <div className={styles.reviewActions}>
                      {c.candidates.map((cand) => (
                        <button
                          key={cand.valor}
                          type="button"
                          className={styles.btn}
                          onClick={() => {
                            checkpoint(celdas)
                            setCeldas((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, value: cand.valor, method: 'manual', candidates: [] }
                                  : x,
                              ),
                            )
                            mostrarToast(`"${c.original}" → "${cand.valor}"`)
                          }}
                        >
                          {cand.valor} · {Math.round(cand.confianza * 100)}%
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => {
                          checkpoint(celdas)
                          setCeldas((cs) =>
                            cs.map((x) => (x.id === c.id ? { ...x, candidates: [] } : x)),
                          )
                          mostrarToast('Grupo pendiente para asociación manual.')
                        }}
                      >
                        Dejar pendiente
                      </button>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
