import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_FILAS,
  agregar,
  baseParaClave,
  celdaBajo,
  claveDeCuenta,
  compactar,
  filasUsadas,
  guardarDiseno,
  leerDisenos,
  mover,
  OBJETIVOS_POR_TIPO,
  porQueNoCabe,
  primerHueco,
  redimensionar,
  restaurarDiseno,
  ubicarBajoPuntero,
  widgetPorId,
  widgetsParaObjetivo,
  COLUMNAS,
} from '@/features/panelInicio'
import type { Disenos, GrupoWidget, Objetivo, Pieza, Rect, WidgetDef } from '@/features/panelInicio'
import { useUsuarios } from '@/features/usuarios'
import styles from './PanelInicioEditor.module.css'

/** Un color por grupo de widgets, el mismo en la paleta y en el tablero. */
const TONO: Record<GrupoWidget, string> = {
  Módulos: '#3A8A52',
  Indicadores: '#C28A12',
  'Paneles de actividad': '#1C7FA6',
  'Portal de cliente': '#7B5EA7',
}

interface Aviso {
  tono: 'ok' | 'error' | 'info'
  texto: string
}

interface Fantasma {
  rect: Rect
  ok: boolean
  nombre: string
}

const MIN_CELDA = 26
const ordenar = (p: Pieza[]) => JSON.stringify([...p].sort((a, b) => a.id.localeCompare(b.id)))
const nombreDe = (id: string) => widgetPorId(id)?.nombre ?? id

/** «se pisa con «kpi:semana»» → con el nombre que lee una persona. */
const motivoLegible = (motivo: string) => motivo.replace(/«([^»]+)»/, (_m, id: string) => `«${nombreDe(id)}»`)

/**
 * Editor del Panel general (Administración General → «Panel de inicio»).
 *
 * El administrador elige a quién (un tipo de cuenta o una cuenta), arrastra widgets desde la paleta al tablero
 * cuadriculado, los mueve, les cambia el tamaño y guarda. Si un widget no cabe, el fantasma se pone rojo y se dice
 * por qué. Todo lo que decide dónde cabe vive en `features/panelInicio/lib/grilla.ts` (puro y probado).
 */
export function PanelInicioEditor() {
  const { usuarios } = useUsuarios()
  const [disenos, setDisenos] = useState<Disenos>({})
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [clave, setClave] = useState('tipo:admin_general')
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const [guardadas, setGuardadas] = useState<Pieza[]>([])
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [fantasma, setFantasma] = useState<Fantasma | null>(null)
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null)
  const [confirmaRestaurar, setConfirmaRestaurar] = useState(false)
  const [celda, setCelda] = useState(48)
  const arrastre = useRef<{ id: string; origen: 'paleta' | 'tablero' } | null>(null)
  const tableroRef = useRef<HTMLDivElement>(null)
  const observador = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    let cancelado = false
    leerDisenos()
      .then((r) => {
        if (cancelado) return
        setDisenos(r.disenos)
        const inicial = r.disenos['tipo:admin_general']?.piezas ?? []
        setPiezas(inicial)
        setGuardadas(inicial)
      })
      .catch((e: unknown) => { if (!cancelado) setErrorCarga(e instanceof Error ? e.message : 'No se pudo leer el panel de inicio.') })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [])

  // El tablero mide su ancho para que cada celda sea cuadrada (12 columnas).
  const medir = useCallback((el: HTMLDivElement | null) => {
    observador.current?.disconnect()
    tableroRef.current = el
    if (!el) return
    const ajustar = () => setCelda(Math.max(MIN_CELDA, el.clientWidth / COLUMNAS))
    ajustar()
    if (typeof ResizeObserver !== 'undefined') {
      observador.current = new ResizeObserver(ajustar)
      observador.current.observe(el)
    }
  }, [])

  const cuenta = clave.startsWith('usuario:') ? usuarios.find((u) => claveDeCuenta(u.id) === clave) : undefined
  const objetivo: Objetivo = useMemo(() => {
    const porTipo = OBJETIVOS_POR_TIPO.find((o) => o.clave === clave)
    if (porTipo) return porTipo
    const esCliente = cuenta?.tipoAcceso === 'cliente'
    return {
      clave,
      etiqueta: cuenta ? `${cuenta.nombre} (${cuenta.email})` : clave,
      audiencia: esCliente ? 'cliente' : 'interno',
      area: esCliente ? (cuenta?.area ?? undefined) : undefined,
    }
  }, [clave, cuenta])

  const catalogo = useMemo(() => widgetsParaObjetivo(objetivo), [objetivo])
  const grupos = useMemo(() => {
    const m = new Map<GrupoWidget, WidgetDef[]>()
    catalogo.forEach((w) => m.set(w.grupo, [...(m.get(w.grupo) ?? []), w]))
    return [...m.entries()]
  }, [catalogo])

  const sucio = ordenar(piezas) !== ordenar(guardadas)
  const filas = Math.max(12, filasUsadas(piezas) + 5)
  const seleccionada = piezas.find((p) => p.id === sel) ?? null
  const hayDisenoGuardado = (disenos[clave]?.piezas?.length ?? 0) > 0

  function irA(nueva: string, forzar = false) {
    if (nueva === clave) return
    if (sucio && !forzar) {
      setPendiente(nueva)
      return
    }
    const g = disenos[nueva]?.piezas ?? []
    setClave(nueva)
    setPiezas(g)
    setGuardadas(g)
    setSel(null)
    setAviso(null)
    setPendiente(null)
    setConfirmaRestaurar(false)
  }

  const fallo = (def: { nombre: string; w?: number; h?: number }, motivo: string): Aviso => ({
    tono: 'error',
    texto: `No hay espacio para «${def.nombre}»${def.w ? ` (${def.w}×${def.h})` : ''} ahí: ${motivoLegible(motivo)}. Prueba otro lugar, achica otro widget o usa «Acomodar».`,
  })

  // ── agregar con el botón (primer hueco libre) ──
  function añadir(def: WidgetDef) {
    const hueco = primerHueco(piezas, def.w, def.h)
    if (!hueco) {
      setAviso({ tono: 'error', texto: `No queda espacio libre para «${def.nombre}» (${def.w}×${def.h}). Quita o achica otro widget, o usa «Acomodar» para juntar los huecos.` })
      return
    }
    const nuevas = agregar(piezas, { id: def.id, ...hueco })
    if (nuevas) {
      setPiezas(nuevas)
      setSel(def.id)
      setAviso({ tono: 'info', texto: `«${def.nombre}» quedó en el primer hueco libre. Arrástralo si lo quieres en otro lado.` })
    }
  }

  // ── arrastrar y soltar ──
  function rectBajoPuntero(e: DragEvent): { rect: Rect; id: string; origen: 'paleta' | 'tablero' } | null {
    const a = arrastre.current
    const el = tableroRef.current
    if (!a || !el) return null
    const def = widgetPorId(a.id)
    const actual = piezas.find((p) => p.id === a.id)
    const w = a.origen === 'tablero' ? actual?.w : def?.w
    const h = a.origen === 'tablero' ? actual?.h : def?.h
    if (!w || !h) return null
    const caja = el.getBoundingClientRect()
    const c = celdaBajo(e.clientX - caja.left, e.clientY - caja.top, celda)
    return { rect: ubicarBajoPuntero(c.x, c.y, w, h), id: a.id, origen: a.origen }
  }

  function sobreTablero(e: DragEvent) {
    const r = rectBajoPuntero(e)
    if (!r) return
    e.preventDefault()
    e.dataTransfer.dropEffect = r.origen === 'paleta' ? 'copy' : 'move'
    const motivo = porQueNoCabe(piezas, r.rect, r.origen === 'tablero' ? r.id : undefined)
    setFantasma({ rect: r.rect, ok: motivo === null, nombre: nombreDe(r.id) })
  }

  function soltar(e: DragEvent) {
    const r = rectBajoPuntero(e)
    setFantasma(null)
    setArrastrandoId(null)
    if (!r) return
    e.preventDefault()
    const nombre = nombreDe(r.id)
    const motivo = porQueNoCabe(piezas, r.rect, r.origen === 'tablero' ? r.id : undefined)
    if (motivo) {
      setAviso(fallo({ nombre, w: r.rect.w, h: r.rect.h }, motivo))
      return
    }
    const nuevas = r.origen === 'paleta' ? agregar(piezas, { id: r.id, ...r.rect }) : mover(piezas, r.id, r.rect.x, r.rect.y)
    if (nuevas) {
      setPiezas(nuevas)
      setSel(r.id)
      setAviso(null)
    }
  }

  function empezarArrastre(e: DragEvent, id: string, origen: 'paleta' | 'tablero') {
    arrastre.current = { id, origen }
    e.dataTransfer.effectAllowed = origen === 'paleta' ? 'copy' : 'move'
    e.dataTransfer.setData('text/plain', id)
    if (origen === 'tablero') setArrastrandoId(id)
    setAviso(null)
  }

  function terminarArrastre() {
    arrastre.current = null
    setFantasma(null)
    setArrastrandoId(null)
  }

  // ── tamaño y teclado ──
  function cambiarTamano(id: string, w: number, h: number) {
    const def = widgetPorId(id)
    const p = piezas.find((q) => q.id === id)
    if (!def || !p) return
    const ancho = Math.max(def.minW, Math.min(w, COLUMNAS - p.x))
    const alto = Math.max(def.minH, Math.min(h, MAX_FILAS - p.y))
    if (ancho === p.w && alto === p.h) return
    const nuevas = redimensionar(piezas, id, ancho, alto)
    if (nuevas) {
      setPiezas(nuevas)
      setAviso(null)
    } else {
      const motivo = porQueNoCabe(piezas, { x: p.x, y: p.y, w: ancho, h: alto }, id) ?? 'no cabe'
      setAviso({ tono: 'error', texto: `«${def.nombre}» no puede ser de ${ancho}×${alto}: ${motivoLegible(motivo)}.` })
    }
  }

  function quitar(id: string) {
    setPiezas((ps) => ps.filter((p) => p.id !== id))
    setSel((s) => (s === id ? null : s))
    setAviso(null)
  }

  function teclado(e: KeyboardEvent, p: Pieza) {
    const paso: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      quitar(p.id)
    } else if (paso[e.key]) {
      e.preventDefault()
      const [dx, dy] = paso[e.key]
      if (e.shiftKey) {
        cambiarTamano(p.id, p.w + dx, p.h + dy)
      } else {
        const nuevas = mover(piezas, p.id, p.x + dx, p.y + dy)
        if (nuevas) {
          setPiezas(nuevas)
          setAviso(null)
        } else {
          setAviso(fallo({ nombre: nombreDe(p.id) }, porQueNoCabe(piezas, { x: p.x + dx, y: p.y + dy, w: p.w, h: p.h }, p.id) ?? 'no cabe'))
        }
      }
    }
  }

  // ── cambiar el tamaño arrastrando la esquina ──
  function empezarResize(e: ReactPointerEvent<HTMLDivElement>, p: Pieza) {
    e.preventDefault()
    e.stopPropagation()
    const inicio = { x: e.clientX, y: e.clientY, w: p.w, h: p.h }
    const def = widgetPorId(p.id)
    const mover = (ev: PointerEvent) => {
      const w = inicio.w + Math.round((ev.clientX - inicio.x) / celda)
      const h = inicio.h + Math.round((ev.clientY - inicio.y) / celda)
      setPiezas((ps) => {
        const actual = ps.find((q) => q.id === p.id)
        if (!actual || !def) return ps
        const ancho = Math.max(def.minW, Math.min(w, COLUMNAS - actual.x))
        const alto = Math.max(def.minH, Math.min(h, MAX_FILAS - actual.y))
        if (ancho === actual.w && alto === actual.h) return ps
        return redimensionar(ps, p.id, ancho, alto) ?? ps
      })
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    setSel(p.id)
  }

  // ── guardar / restaurar ──
  async function guardar() {
    setGuardando(true)
    setAviso(null)
    try {
      if (piezas.length === 0) {
        await restaurarDiseno(clave)
        setDisenos((d) => { const c = { ...d }; delete c[clave]; return c })
        setGuardadas([])
        setAviso({ tono: 'ok', texto: 'Quedó vacío, así que esta cuenta vuelve a ver su panel de siempre.' })
      } else {
        const r = await guardarDiseno(clave, piezas)
        setDisenos((d) => ({ ...d, [clave]: { piezas: r.piezas } }))
        setGuardadas(r.piezas)
        setAviso({ tono: 'ok', texto: 'Guardado. Quien tenga este panel lo verá la próxima vez que entre o recargue la página.' })
      }
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof Error ? `No se pudo guardar: ${e.message}` : 'No se pudo guardar.' })
    } finally {
      setGuardando(false)
    }
  }

  async function restaurar() {
    setGuardando(true)
    try {
      await restaurarDiseno(clave)
      setDisenos((d) => { const c = { ...d }; delete c[clave]; return c })
      setPiezas([])
      setGuardadas([])
      setSel(null)
      setConfirmaRestaurar(false)
      setAviso({ tono: 'ok', texto: 'Listo: esta cuenta vuelve a ver su panel de siempre.' })
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof Error ? `No se pudo restaurar: ${e.message}` : 'No se pudo restaurar.' })
    } finally {
      setGuardando(false)
    }
  }

  function empezarConElDeSiempre() {
    const ids = new Set(catalogo.map((w) => w.id))
    setPiezas(baseParaClave(clave).filter((p) => ids.has(p.id)))
    setAviso({ tono: 'info', texto: 'Cargué el panel de siempre. Muévelo, quítale lo que sobre o agrégale lo que falte.' })
  }

  if (cargando) return <p className={styles.nota}>Cargando el panel de inicio…</p>
  if (errorCarga) return <p className={styles.aviso} data-tono="error" role="alert">{errorCarga}</p>

  const conDiseno = (k: string) => (disenos[k]?.piezas?.length ?? 0) > 0
  const puestos = new Set(piezas.map((p) => p.id))

  return (
    <div className={styles.editor}>
      <ol className={styles.pasos}>
        <li className={styles.paso}><span className={styles.num}>1</span><span><b>Elige a quién.</b> Un tipo de cuenta (lo ven todas) o una cuenta en particular (gana sobre el tipo).</span></li>
        <li className={styles.paso}><span className={styles.num}>2</span><span><b>Arrastra los widgets</b> de la derecha al tablero. Verde = cabe, rojo = no hay espacio.</span></li>
        <li className={styles.paso}><span className={styles.num}>3</span><span><b>Ajusta y guarda.</b> Agranda con la esquina (o Shift + flechas) y aprieta «Guardar».</span></li>
      </ol>

      <section className={styles.quien} aria-label="A quién se le arma el panel">
        <span className={styles.etq}>Por tipo de cuenta</span>
        <div className={styles.chips}>
          {OBJETIVOS_POR_TIPO.map((o) => (
            <button key={o.clave} type="button" className={styles.chip} aria-pressed={clave === o.clave} onClick={() => irA(o.clave)}>
              {conDiseno(o.clave) && <i className={styles.punto} title="Tiene un panel armado" />}
              {o.etiqueta}
            </button>
          ))}
        </div>
        <div className={styles.cuenta}>
          <span className={styles.etq}>O una cuenta en particular</span>
          <select aria-label="Cuenta en particular" value={clave.startsWith('usuario:') ? clave : ''} onChange={(e) => e.target.value && irA(e.target.value)}>
            <option value="">Elegir cuenta…</option>
            {usuarios.map((u) => (
              <option key={u.id} value={claveDeCuenta(u.id)}>
                {conDiseno(claveDeCuenta(u.id)) ? '● ' : ''}{u.nombre} · {u.email}
              </option>
            ))}
          </select>
        </div>
        {pendiente && (
          <div className={styles.cambioPendiente} role="alert">
            <span>Tienes cambios sin guardar en este panel.</span>
            <button type="button" className={styles.boton} onClick={() => irA(pendiente, true)}>Descartar y cambiar</button>
            <button type="button" className={styles.boton} onClick={() => setPendiente(null)}>Seguir editando</button>
          </div>
        )}
      </section>

      <div className={styles.cuerpo}>
        <section className={styles.lienzo} aria-label="Tablero">
          <div className={styles.barra}>
            <h3>Panel de: {objetivo.etiqueta}</h3>
            <button type="button" className={styles.boton} onClick={() => { setPiezas(compactar(piezas)); setAviso(null) }} disabled={piezas.length === 0}>Acomodar</button>
            <button type="button" className={styles.boton} onClick={() => { setPiezas([]); setSel(null); setAviso(null) }} disabled={piezas.length === 0}>Vaciar</button>
            <button type="button" className={styles.boton} onClick={() => { setPiezas(guardadas); setSel(null); setAviso(null) }} disabled={!sucio}>Descartar cambios</button>
            <button type="button" className={`${styles.boton} ${styles.principal}`} onClick={() => void guardar()} disabled={!sucio || guardando}>
              {guardando ? 'Guardando…' : sucio ? 'Guardar' : 'Guardado'}
            </button>
          </div>

          {aviso && <p className={styles.aviso} data-tono={aviso.tono} role={aviso.tono === 'error' ? 'alert' : 'status'}>{aviso.texto}</p>}

          <div className={styles.tableroMarco}>
            <div
              ref={medir}
              className={styles.tablero}
              style={{ '--celda': `${celda}px`, height: filas * celda } as CSSProperties}
              onDragOver={sobreTablero}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFantasma(null) }}
              onDrop={soltar}
              onClick={(e) => { if (e.target === e.currentTarget) setSel(null) }}
              data-testid="tablero"
            >
              {piezas.length === 0 && (
                <div className={styles.vacio}>
                  <span>Este panel está vacío.<br />Arrastra un widget desde la derecha hasta aquí.</span>
                  <button type="button" className={styles.boton} onClick={empezarConElDeSiempre}>Empezar con el panel de siempre</button>
                </div>
              )}

              {piezas.map((p) => {
                const def = widgetPorId(p.id)
                const tono = def ? TONO[def.grupo] : '#888'
                return (
                  <div
                    key={p.id}
                    role="group"
                    tabIndex={0}
                    aria-label={`${nombreDe(p.id)}, ${p.w} por ${p.h}. Flechas para mover, Shift y flechas para el tamaño, Suprimir para quitar.`}
                    className={styles.pieza}
                    data-sel={sel === p.id}
                    data-arrastrando={arrastrandoId === p.id}
                    style={{ '--tono': tono, left: p.x * celda + 1, top: p.y * celda + 1, width: p.w * celda - 2, height: p.h * celda - 2 } as CSSProperties}
                    draggable
                    onDragStart={(e) => empezarArrastre(e, p.id, 'tablero')}
                    onDragEnd={terminarArrastre}
                    onClick={() => setSel(p.id)}
                    onKeyDown={(e) => teclado(e, p)}
                  >
                    <strong>{nombreDe(p.id)}</strong>
                    {p.h >= 3 && def && <small>{def.descripcion}</small>}
                    <span className={styles.medida}>{p.w}×{p.h}</span>
                    <button type="button" className={styles.quitar} aria-label={`Quitar ${nombreDe(p.id)}`} onClick={(e) => { e.stopPropagation(); quitar(p.id) }}>×</button>
                    <div className={styles.agarre} onPointerDown={(e) => empezarResize(e, p)} role="presentation" title="Arrastra para cambiar el tamaño" />
                  </div>
                )
              })}

              {fantasma && (
                <div
                  className={styles.fantasma}
                  data-ok={fantasma.ok}
                  style={{ left: fantasma.rect.x * celda + 1, top: fantasma.rect.y * celda + 1, width: fantasma.rect.w * celda - 2, height: fantasma.rect.h * celda - 2 }}
                >
                  {fantasma.ok ? `${fantasma.nombre}: aquí cabe` : 'Aquí no hay espacio'}
                </div>
              )}
            </div>
          </div>

          <div className={styles.herramientas}>
            {seleccionada ? (
              <>
                <b>{nombreDe(seleccionada.id)}</b>
                <span>Ancho</span>
                <button type="button" className={styles.mini} aria-label="Menos ancho" onClick={() => cambiarTamano(seleccionada.id, seleccionada.w - 1, seleccionada.h)}>−</button>
                <b>{seleccionada.w}</b>
                <button type="button" className={styles.mini} aria-label="Más ancho" onClick={() => cambiarTamano(seleccionada.id, seleccionada.w + 1, seleccionada.h)}>+</button>
                <span>Alto</span>
                <button type="button" className={styles.mini} aria-label="Menos alto" onClick={() => cambiarTamano(seleccionada.id, seleccionada.w, seleccionada.h - 1)}>−</button>
                <b>{seleccionada.h}</b>
                <button type="button" className={styles.mini} aria-label="Más alto" onClick={() => cambiarTamano(seleccionada.id, seleccionada.w, seleccionada.h + 1)}>+</button>
                <button type="button" className={`${styles.mini} ${styles.peligro}`} onClick={() => quitar(seleccionada.id)}>Quitar</button>
              </>
            ) : (
              <span className={styles.nota}>Toca un widget para cambiarle el tamaño. El tablero tiene {COLUMNAS} columnas; los widgets se acomodan sobre esa cuadrícula.</span>
            )}
          </div>

          {hayDisenoGuardado && (
            <div className={styles.herramientas}>
              {confirmaRestaurar ? (
                <>
                  <span>¿Seguro? Esta cuenta volverá a ver su panel de siempre.</span>
                  <button type="button" className={`${styles.mini} ${styles.peligro}`} onClick={() => void restaurar()} disabled={guardando}>Sí, restaurar</button>
                  <button type="button" className={styles.mini} onClick={() => setConfirmaRestaurar(false)}>Cancelar</button>
                </>
              ) : (
                <>
                  <span className={styles.nota}>Este panel ya está personalizado.</span>
                  <button type="button" className={styles.mini} onClick={() => setConfirmaRestaurar(true)}>Restaurar el panel original</button>
                </>
              )}
            </div>
          )}
        </section>

        <aside className={styles.paleta} aria-label="Widgets disponibles">
          <h3>Widgets</h3>
          <p>Arrástralos al tablero, o aprieta «Añadir» para ponerlos en el primer hueco libre.</p>
          {grupos.map(([grupo, lista]) => (
            <div key={grupo} className={styles.grupo}>
              <span className={styles.etq}>{grupo}</span>
              {lista.map((w) => {
                const puesto = puestos.has(w.id)
                return (
                  <div
                    key={w.id}
                    className={styles.widget}
                    data-puesto={puesto}
                    style={{ '--tono': TONO[w.grupo] } as CSSProperties}
                    draggable={!puesto}
                    onDragStart={(e) => !puesto && empezarArrastre(e, w.id, 'paleta')}
                    onDragEnd={terminarArrastre}
                  >
                    <div className={styles.widgetFila}>
                      <strong>{w.nombre}</strong>
                      <button type="button" className={styles.add} disabled={puesto} onClick={() => añadir(w)} aria-label={`Añadir ${w.nombre}`}>
                        {puesto ? '✓ puesto' : 'Añadir'}
                      </button>
                    </div>
                    <small>{w.descripcion} · {w.w}×{w.h}</small>
                  </div>
                )
              })}
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
