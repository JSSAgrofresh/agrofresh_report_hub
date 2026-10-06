import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconoAlerta, IconoBuscar, IconoCerrar } from '@/components/ui/iconosAccion'
import { EtiquetaServicio } from '@/components/ui/SelectorServicio'
import { ETIQUETA_LISTA } from '@/lib/servicio'
import type { ListaDistribucion } from '@/lib/servicio'
import {
  ETIQUETA_FILTRO_TABLA, INFO_CAMPO, aCambios, aplicarListas, claveCelda, clavePlanta, coincideFiltro, coincideTexto,
  compararListas, desdeComparacion, diffLista, exportarListas, filaVacia, indicadores, listaDe, mismaLista, obtenerEstado, plantaNueva,
  propuestasDeFila, proponer, resumenRevision, valorMostrado,
} from '@/features/listasDistribucion'
import type {
  CampoLista, EstadoListas, FiltroTabla, PlantaLista, PlantaNueva, PlantaRetirada, Propuestas, Renombres, ResultadoAplicar, ResultadoComparacion,
} from '@/features/listasDistribucion'
import { DialogoAgregarPlanta } from './DialogoAgregarPlanta'
import type { DatosPlanta } from './DialogoAgregarPlanta'
import { EditorCelda } from './EditorCelda'
import type { EditorAbierto } from './EditorCelda'
import { FijosDeLista } from './FijosDeLista'
import { IndicadoresListas } from './IndicadoresListas'
import { TablaListas } from './TablaListas'
import type { Destino } from './TablaListas'
import styles from './ListasPanel.module.css'

const nf = new Intl.NumberFormat('es-CL')
const POR_PAGINA = 200

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto)

const FILTROS_CON_NUEVAS: FiltroTabla[] = ['todas', 'cambios']

/**
 * Listas de distribución como una tabla dinámica: se ve desde el comienzo, se
 * edita a mano o se importa un Excel, y todo lo que cambia queda en amarillo
 * hasta aceptarlo o rechazarlo. Recién al guardar se escribe, con respaldo.
 */
export function ListasPanel({ servicio = 'linea' }: { servicio?: ListaDistribucion } = {}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<EstadoListas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [incluirSinLista, setIncluirSinLista] = useState(false)

  const [propuestas, setPropuestas] = useState<Propuestas>({})
  const [nuevas, setNuevas] = useState<PlantaNueva[]>([])
  const [retiradas, setRetiradas] = useState<PlantaRetirada[]>([])
  const [renombres, setRenombres] = useState<Renombres>({})
  const [separadas, setSeparadas] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState<FiltroTabla>('todas')
  const [texto, setTexto] = useState('')
  const [limite, setLimite] = useState(POR_PAGINA)

  const [editor, setEditor] = useState<EditorAbierto | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [importado, setImportado] = useState<{ archivo: string; resultado: ResultadoComparacion } | null>(null)
  const [hecho, setHecho] = useState<ResultadoAplicar | null>(null)

  useEffect(() => {
    let cancelado = false
    obtenerEstado(incluirSinLista, servicio)
      .then((e) => { if (!cancelado) { setEstado(e); setError(null) } })
      .catch((e: unknown) => { if (!cancelado) setError(mensaje(e, 'No se pudieron cargar las listas.')) })
    return () => { cancelado = true }
  }, [incluirSinLista, recarga, servicio])

  const ind = useMemo(() => (estado ? indicadores(estado) : null), [estado])
  const conCambios = useMemo(() => new Set([...Object.values(propuestas).map((p) => p.plantaClave), ...Object.keys(renombres)]), [propuestas, renombres])
  const revision = useMemo(
    () => (estado ? resumenRevision(propuestas, nuevas, estado, retiradas, renombres) : { pendientes: 0, aceptadas: 0, agregan: 0, quitan: 0, ajustes: 0 }),
    [estado, propuestas, nuevas, retiradas, renombres],
  )
  const filasFiltradas = useMemo(
    () => (estado?.filas ?? []).filter((f) => coincideFiltro(f, filtro, conCambios) && coincideTexto(f, texto, propuestas)),
    [estado, filtro, conCambios, texto, propuestas],
  )
  const nuevasVisibles = useMemo(
    () => (FILTROS_CON_NUEVAS.includes(filtro) ? nuevas.filter((n) => coincideTexto({ ...n.fila, sold_to: n.sold_to, ship_to: n.ship_to, copia_mal: { admin: [], comercial: [], tecnico: [] }, en_listados: null, sin_contactos: false }, texto, {})) : []),
    [nuevas, filtro, texto],
  )
  const hayRevision = revision.pendientes + revision.aceptadas > 0

  // ---- edición de celdas -------------------------------------------------
  function abrirEditor(ancla: DOMRect, d: Destino) {
    const campo = d.campos[0]
    const todas = d.campos.length > 1
    if (d.tipo === 'fila') {
      const fila = d.fila
      const clave = claveCelda(clavePlanta(fila.sold_to, fila.ship_to), campo)
      setEditor({
        ancla, campo, todasLasEspecies: todas,
        titulo: `${fila.ship_to} · ${todas ? 'Todas las especies' : INFO_CAMPO[campo].titulo}`,
        guardado: listaDe(fila, campo), actual: valorMostrado(fila, campo, propuestas),
        copiaMal: !todas && (campo === 'admin' || campo === 'comercial' || campo === 'tecnico') ? fila.copia_mal[campo] : [],
        ajusteYaPropuesto: (propuestas[clave]?.ajustarCopia.length ?? 0) > 0,
        onGuardar: (lista, ajustar) => guardarFila(d, lista, ajustar),
      })
    } else {
      const n = nuevas.find((x) => x.id === d.id)
      if (!n) return
      setEditor({
        ancla, campo, todasLasEspecies: todas, titulo: `${n.ship_to} · ${todas ? 'Todas las especies' : INFO_CAMPO[campo].titulo}`,
        guardado: [], actual: listaDe(n.fila, campo), copiaMal: [],
        onGuardar: (lista) => guardarNueva(n.id, d.campos, lista),
      })
    }
  }

  function guardarFila(d: Extract<Destino, { tipo: 'fila' }>, lista: string[], ajustar: string[]) {
    setHecho(null)
    setPropuestas((p) => d.campos.reduce((acc, c) => proponer(acc, d.fila, c, lista, 'manual', 'aceptada', ajustar), p))
  }

  function guardarNueva(id: string, campos: CampoLista[], lista: string[]) {
    setNuevas((ns) => ns.map((n) => {
      if (n.id !== id) return n
      const fila = { ...n.fila, clientes: { ...n.fila.clientes } }
      for (const c of campos) {
        if (c === 'admin' || c === 'comercial' || c === 'tecnico') fila[c] = lista
        else fila.clientes[c] = lista
      }
      return { ...n, fila }
    }))
  }

  const aceptar = (d: Destino) => {
    if (d.tipo !== 'fila') return
    const k = clavePlanta(d.fila.sold_to, d.fila.ship_to)
    setPropuestas((p) => {
      const sig = { ...p }
      for (const c of d.campos) { const q = sig[claveCelda(k, c)]; if (q) sig[claveCelda(k, c)] = { ...q, estado: 'aceptada' } }
      return sig
    })
  }

  const rechazar = (d: Destino) => {
    if (d.tipo !== 'fila') return
    const k = clavePlanta(d.fila.sold_to, d.fila.ship_to)
    setPropuestas((p) => {
      const sig = { ...p }
      for (const c of d.campos) delete sig[claveCelda(k, c)]
      return sig
    })
  }

  // ---- revisión en bloque ------------------------------------------------
  const aceptarTodos = () => {
    setPropuestas((p) => Object.fromEntries(Object.entries(p).map(([k, q]) => [k, { ...q, estado: 'aceptada' as const }])))
    setNuevas((ns) => ns.map((n) => ({ ...n, estado: 'aceptada' as const })))
  }

  const aceptarSoloAgregan = () => {
    if (!estado) return
    const porClave = new Map(estado.filas.map((f) => [clavePlanta(f.sold_to, f.ship_to), f]))
    setPropuestas((p) => Object.fromEntries(Object.entries(p).map(([k, q]) => {
      const fila = porClave.get(q.plantaClave)
      const sinQuitar = !fila || diffLista(listaDe(fila, q.campo), q.nuevo).quitar.length === 0
      return [k, sinQuitar ? { ...q, estado: 'aceptada' as const } : q]
    })))
  }

  const rechazarPendientes = () => {
    setPropuestas((p) => Object.fromEntries(Object.entries(p).filter(([, q]) => q.estado !== 'pendiente')))
    setNuevas((ns) => ns.filter((n) => n.estado !== 'pendiente'))
  }

  const descartarTodo = () => {
    setPropuestas({})
    setNuevas([])
    setRetiradas([])
    setRenombres({})
    setImportado(null)
  }

  // ---- plantas nuevas ----------------------------------------------------
  function usarSugerencia(id: string, destino: PlantaLista) {
    const n = nuevas.find((x) => x.id === id)
    if (!n || !estado) return
    const fila = estado.filas.find((f) => clavePlanta(f.sold_to, f.ship_to) === clavePlanta(destino.sold_to, destino.ship_to))
    if (fila) {
      const nuevasProps = propuestasDeFila(n.fila, fila).map((q) => ({ ...q, estado: n.estado }))
      setPropuestas((p) => ({ ...p, ...Object.fromEntries(nuevasProps.map((q) => [q.clave, q])) }))
      setNuevas((ns) => ns.filter((x) => x.id !== id))
      setFiltro('cambios')
    } else {
      const renombrada = plantaNueva({ ...n.fila, sold_to: destino.sold_to, ship_to: destino.ship_to }, n.origen, n.estado, true, [])
      setNuevas((ns) => ns.map((x) => (x.id === id ? { ...renombrada, crearEnListados: false } : x)))
    }
  }

  /** El nombre del Excel es el correcto: se le cambia el nombre a la planta de Listados (conservando su
   * lista) y lo que traía el Excel queda como propuestas amarillas sobre ella. */
  function renombrarSugerencia(id: string, destino: PlantaLista) {
    const n = nuevas.find((x) => x.id === id)
    if (!n || !estado) return
    const fila = estado.filas.find((f) => clavePlanta(f.sold_to, f.ship_to) === clavePlanta(destino.sold_to, destino.ship_to))
    if (!fila) return
    const nuevasProps = propuestasDeFila(n.fila, fila).map((q) => ({ ...q, estado: n.estado }))
    setPropuestas((p) => ({ ...p, ...Object.fromEntries(nuevasProps.map((q) => [q.clave, q])) }))
    setNuevas((ns) => ns.filter((x) => x.id !== id))
    setRenombres((r) => ({ ...r, [clavePlanta(fila.sold_to, fila.ship_to)]: { de: { sold_to: fila.sold_to, ship_to: fila.ship_to }, a: n.ship_to } }))
    setFiltro('cambios')
  }

  function agregarPlanta(d: DatosPlanta) {
    const fila = { ...filaVacia(d.sold_to, d.ship_to), codigo_sold: d.codigo_sold, codigo_ship: d.codigo_ship }
    setNuevas((ns) => [plantaNueva(fila, 'manual', 'aceptada', false), ...ns])
    setFiltro('todas')
    setTexto('')
    setAgregando(false)
    setHecho(null)
  }

  function yaExiste(soldTo: string, shipTo: string): string | null {
    const k = clavePlanta(soldTo, shipTo)
    const f = estado?.filas.find((x) => clavePlanta(x.sold_to, x.ship_to) === k)
    if (f) return `Ya está en las listas como «${f.ship_to}» (${f.sold_to}). Edítala directamente en la tabla.`
    if (nuevas.some((n) => n.id === k)) return 'Esa planta ya está agregada en esta sesión.'
    return null
  }

  // ---- Excel -------------------------------------------------------------
  async function exportar() {
    setExportando(true)
    setError(null)
    try { await exportarListas(incluirSinLista, servicio) } catch (e) { setError(mensaje(e, 'No se pudo exportar el Excel.')) } finally { setExportando(false) }
  }

  async function importar(file: File) {
    if (!estado) return
    setImportando(true)
    setError(null)
    setHecho(null)
    try {
      const resultado = await compararListas(file, servicio)
      const { propuestas: nuevasProps, nuevas: nuevasPlantas, retiradas: plantasRetiradas } = desdeComparacion(estado, resultado)
      setRetiradas(plantasRetiradas)
      // lo que ya aceptaste a mano no se pisa
      setPropuestas((p) => {
        const sig = { ...nuevasProps }
        for (const [k, q] of Object.entries(p)) if (q.estado === 'aceptada' && q.origen === 'manual') sig[k] = q
        return sig
      })
      setNuevas((ns) => [...nuevasPlantas.filter((x) => !ns.some((n) => n.id === x.id)), ...ns.filter((n) => n.origen === 'manual')])
      setImportado({ archivo: file.name, resultado })
      setFiltro(resultado.cambios.length > 0 ? 'cambios' : 'todas')
      setTexto('')
    } catch (e) {
      setError(mensaje(e, 'No se pudo leer el Excel.'))
    } finally {
      setImportando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  // ---- guardar -----------------------------------------------------------
  async function guardar() {
    if (!estado) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const resultado = await aplicarListas(aCambios(estado, propuestas, nuevas, retiradas, renombres), servicio)
      const fresco = await obtenerEstado(incluirSinLista, servicio)
      const porClave = new Map(fresco.filas.map((f) => [clavePlanta(f.sold_to, f.ship_to), f]))
      setEstado(fresco)
      setPropuestas((p) => Object.fromEntries(Object.entries(p).filter(([, q]) => {
        if (q.estado === 'aceptada') return false
        const f = porClave.get(q.plantaClave)
        return !(f && mismaLista(listaDe(f, q.campo), q.nuevo) && q.ajustarCopia.length === 0)
      })))
      setNuevas((ns) => ns.filter((n) => n.estado !== 'aceptada'))
      setRetiradas((rs) => rs.filter((r) => !r.quitar))
      setRenombres({})
      setHecho(resultado)
      setConfirmando(false)
    } catch (e) {
      setErrorGuardar(mensaje(e, 'No se pudieron guardar los cambios.'))
    } finally {
      setGuardando(false)
    }
  }

  const aCrear = nuevas.filter((n) => n.estado === 'aceptada' && n.crearEnListados).length
  const aQuitar = retiradas.filter((r) => r.quitar).length

  if (error && !estado) {
    return (
      <div className={styles.errorCaja} role="alert">
        <IconoAlerta /> <span>{error}</span> <Button variant="secondary" onClick={() => setRecarga((n) => n + 1)}>Reintentar</Button>
      </div>
    )
  }
  if (!estado || !ind) {
    return <div aria-busy="true" className={styles.cargando}><Skeleton style={{ width: '100%', height: 90 }} /><Skeleton style={{ width: '100%', height: 320 }} /></div>
  }

  return (
    <div className={styles.panel}>
      {estado.fijos && <FijosDeLista fijos={estado.fijos} servicio={servicio} />}
      <IndicadoresListas ind={ind} resumen={estado.resumen} filtro={filtro} onFiltro={(f) => {
        if (f === 'sin_lista_listados') setIncluirSinLista(true)
        setFiltro(f)
        setLimite(POR_PAGINA)
      }} />

      <details className={styles.guia}>
        <summary>¿Cómo se lee y se usa esta tabla?</summary>
        <div className={styles.guiaCuerpo}>
          <div>
            <b>Cada fila es una planta.</b> Las tres primeras columnas son del equipo AgroFresh: el <span className={`${styles.via} ${styles.CCO}`}>Admin Report Hub</span> y el{' '}
            <span className={`${styles.via} ${styles.CCO}`}>técnico</span> van en copia oculta, y el <span className={`${styles.via} ${styles.CC}`}>comercial</span> en copia. Las columnas
            siguientes son los correos del cliente (<span className={`${styles.via} ${styles.PARA}`}>Para</span>) según la especie de la muestra; si todas las especies tienen la misma lista, se muestra una sola celda.
          </div>
          <div>
            <b>Haz clic en una celda</b> para editarla: escribe o pega correos. Tu cambio queda <span className={styles.leyendaAceptada}>en verde</span> hasta guardar.
            <b> Importar un Excel</b> pone sus diferencias <span className={styles.leyendaPendiente}>en amarillo</span>: acéptalas (✓) o recházalas (✕) una por una.
          </div>
          <div>
            Un <span className={styles.leyendaFalta}>⚠ Falta</span> es una celda que debería tener a alguien. Una celda vacía en el Excel <b>no quita</b> a nadie; para sacar a alguien, borra su correo y deja los demás.
            Nada se escribe hasta apretar <b>Guardar</b>, y antes se deja un respaldo.
          </div>
        </div>
      </details>

      <div className={styles.barra}>
        <label className={styles.buscar}>
          <IconoBuscar className={styles.lupa} width={16} height={16} />
          <input type="search" placeholder="Buscar planta, cliente o correo…" aria-label="Buscar" value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA) }} />
        </label>
        {(filtro !== 'todas' || texto) && (
          <button type="button" className={styles.limpiar} onClick={() => { setFiltro('todas'); setTexto('') }}>
            <IconoCerrar width={14} height={14} /> Quitar filtros{filtro !== 'todas' ? ` (${ETIQUETA_FILTRO_TABLA[filtro]})` : ''}
          </button>
        )}
        <span className={styles.espacio} />
        <label className={styles.check}>
          <input type="checkbox" checked={incluirSinLista} onChange={(e) => setIncluirSinLista(e.target.checked)} />
          Mostrar plantas de Listados sin lista{estado.resumen.listados_sin_lista ? ` (${nf.format(estado.resumen.listados_sin_lista)})` : ''}
        </label>
        <Button variant="secondary" onClick={() => setAgregando(true)}>+ Agregar planta</Button>
        <input ref={entrada} type="file" accept=".xlsx" className={styles.oculto} aria-label="Importar Excel"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f) }} />
        <Button variant="secondary" onClick={() => entrada.current?.click()} disabled={importando}>{importando ? 'Leyendo…' : 'Importar Excel'}</Button>
        <Button variant="secondary" onClick={() => void exportar()} disabled={exportando}>{exportando ? 'Exportando…' : 'Exportar Excel'}</Button>
      </div>

      {error && <div className={styles.errorCaja} role="alert"><IconoAlerta /> <span>{error}</span></div>}

      {hecho && (
        <div className={styles.exito} role="status">
          <b>Listo: {nf.format(hecho.aplicados)} {hecho.aplicados === 1 ? 'cambio guardado' : 'cambios guardados'}</b> en {nf.format(hecho.plantas)} {hecho.plantas === 1 ? 'planta' : 'plantas'}.
          {hecho.listados_creados && (hecho.listados_creados.plantas > 0 || hecho.listados_creados.clientes > 0) && (
            <> Se crearon en Listados: {hecho.listados_creados.plantas} {hecho.listados_creados.plantas === 1 ? 'planta' : 'plantas'}{hecho.listados_creados.clientes > 0 && ` y ${hecho.listados_creados.clientes} ${hecho.listados_creados.clientes === 1 ? 'cliente' : 'clientes'}`}.</>
          )}{' '}
          Respaldo: <code>{hecho.respaldo}</code>.
          {hecho.ignorados.length > 0 && <> Se omitieron {hecho.ignorados.length}: {hecho.ignorados.join(' · ')}</>}
        </div>
      )}

      {importado && (
        <div className={styles.importado} role="status">
          <span>
            <b>{importado.archivo}</b>: {importado.resultado.cambios.length === 0
              ? 'el sistema ya coincide con el Excel.'
              : `${nf.format(importado.resultado.cambios.length)} ${importado.resultado.cambios.length === 1 ? 'cambio' : 'cambios'} en amarillo en ${nf.format(importado.resultado.resumen.plantas_con_cambios)} plantas. ${nf.format(importado.resultado.resumen.plantas_sin_cambios)} sin cambios.`}
          </span>
          <button type="button" onClick={() => setImportado(null)} aria-label="Cerrar aviso"><IconoCerrar width={14} height={14} /></button>
          {importado.resultado.resumen.avisos && importado.resultado.resumen.avisos.length > 0 && (
            <details>
              <summary><IconoAlerta width={14} height={14} /> {importado.resultado.resumen.avisos.length} avisos al leer el Excel</summary>
              <ul>{importado.resultado.resumen.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {retiradas.length > 0 && (
        <details className={styles.retiradas} open>
          <summary>
            <IconoAlerta width={14} height={14} /> {nf.format(retiradas.length)} {retiradas.length === 1 ? 'planta del sistema no viene' : 'plantas del sistema no vienen'} en tu Excel
            {aQuitar > 0 && <> · <b>{nf.format(aQuitar)} marcada{aQuitar === 1 ? '' : 's'} para quitar</b></>}
          </summary>
          <p>
            Importar nunca borra plantas. Si tu base nueva es la verdad, marca las que ya no existen y se les quitará toda su lista
            (cliente, comercial, técnico y admin) al guardar. Las que no marques quedan como están. Listados no se toca.
          </p>
          <div className={styles.retiradasAcciones}>
            <button type="button" className={styles.atajo} onClick={() => setRetiradas((rs) => rs.map((r) => ({ ...r, quitar: true })))}>Marcar todas</button>
            <button type="button" className={styles.atajo} onClick={() => setRetiradas((rs) => rs.map((r) => ({ ...r, quitar: false })))}>Desmarcar todas</button>
          </div>
          <ul>
            {retiradas.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={r.quitar} aria-label={`Quitar la lista de ${r.ship_to}`}
                    onChange={(e) => setRetiradas((rs) => rs.map((x) => (x.id === r.id ? { ...x, quitar: e.target.checked } : x)))} />
                  <b>{r.ship_to}</b> <span>{r.sold_to}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {hayRevision && (
        <div className={styles.revision} role="region" aria-label="Revisión de cambios">
          <span className={styles.contador}>
            <i className={styles.puntoAmarillo} aria-hidden /> <b>{nf.format(revision.pendientes)}</b> por revisar
          </span>
          <span className={styles.contador}>
            <i className={styles.puntoVerde} aria-hidden /> <b>{nf.format(revision.aceptadas)}</b> aceptados
            {revision.aceptadas > 0 && <small> (+{nf.format(revision.agregan)} / −{nf.format(revision.quitan)} correos)</small>}
          </span>
          <Button onClick={() => { setErrorGuardar(null); setConfirmando(true) }} disabled={revision.aceptadas === 0}>
            Guardar {revision.aceptadas > 0 ? nf.format(revision.aceptadas) : ''} {revision.aceptadas === 1 ? 'cambio' : 'cambios'}
          </Button>
          <span className={styles.espacio} />
          {revision.pendientes > 0 && (
            <>
              <button type="button" className={styles.atajo} onClick={aceptarSoloAgregan}>Aceptar los que solo agregan</button>
              <button type="button" className={styles.atajo} onClick={aceptarTodos}>Aceptar todos</button>
              <button type="button" className={styles.atajo} onClick={rechazarPendientes}>Rechazar los pendientes</button>
            </>
          )}
          <button type="button" className={styles.atajo} onClick={descartarTodo}>Descartar todo</button>
        </div>
      )}

      {filasFiltradas.length === 0 && nuevasVisibles.length === 0 ? (
        <div className={styles.vacio}>
          <h3>{estado.filas.length === 0 ? 'Aún no hay listas cargadas' : 'Ninguna planta coincide con el filtro'}</h3>
          <p>{estado.filas.length === 0 ? (servicio === 'linea' ? 'Importa el Excel maestro o agrega una planta.' : 'Mientras no cargues plantas, cada solicitud sale solo con los destinatarios de arriba. Importa un Excel o agrega una planta para sumar los del cliente.') : 'Prueba quitando los filtros o buscando de otra forma.'}</p>
        </div>
      ) : (
        <>
          <TablaListas
            filas={filasFiltradas.slice(0, limite)}
            nuevas={nuevasVisibles}
            propuestas={propuestas}
            separadas={separadas}
            onEditar={abrirEditor}
            onAceptar={aceptar}
            onRechazar={rechazar}
            onSeparar={(k) => setSeparadas((s) => { const sig = new Set(s); if (!sig.delete(k)) sig.add(k); return sig })}
            onAceptarNueva={(id) => setNuevas((ns) => ns.map((n) => (n.id === id ? { ...n, estado: 'aceptada' } : n)))}
            onQuitarNueva={(id) => setNuevas((ns) => ns.filter((n) => n.id !== id))}
            onCrearEnListados={(id, crear) => setNuevas((ns) => ns.map((n) => (n.id === id ? { ...n, crearEnListados: crear } : n)))}
            onUsarSugerencia={usarSugerencia}
            renombres={renombres}
            puedeRenombrar={(s) => estado.filas.some((f) => clavePlanta(f.sold_to, f.ship_to) === clavePlanta(s.sold_to, s.ship_to))}
            onRenombrar={renombrarSugerencia}
            onDeshacerRenombre={(k) => setRenombres((r) => { const { [k]: _quitada, ...resto } = r; return resto })}
          />
          <p className={styles.pie}>
            Mostrando {nf.format(Math.min(limite, filasFiltradas.length))} de {nf.format(filasFiltradas.length)} plantas
            {filasFiltradas.length > limite && <> · <button type="button" className={styles.atajo} onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar {nf.format(Math.min(POR_PAGINA, filasFiltradas.length - limite))} más</button></>}
          </p>
        </>
      )}

      {editor && <EditorCelda editor={editor} onCerrar={() => setEditor(null)} />}
      {agregando && <DialogoAgregarPlanta clientes={estado.clientes} existe={yaExiste} onAgregar={agregarPlanta} onCerrar={() => setAgregando(false)} />}

      {confirmando && (
        <Modal
          titulo={`¿Guardar los cambios en la lista de ${ETIQUETA_LISTA[servicio]}?`}
          onCerrar={() => !guardando && setConfirmando(false)}
          pie={
            <>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={guardando} data-foco>Cancelar</Button>
              <Button onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
            </>
          }
        >
          <p>
            Se guardarán <b>{nf.format(revision.aceptadas)}</b> {revision.aceptadas === 1 ? 'cambio' : 'cambios'}: <b>{nf.format(revision.agregan)}</b> {revision.agregan === 1 ? 'correo agregado' : 'correos agregados'}
            {revision.quitan > 0 && <>, <b className={styles.rojo}>{nf.format(revision.quitan)} {revision.quitan === 1 ? 'correo quitado' : 'correos quitados'}</b></>}
            {revision.ajustes > 0 && <>, {nf.format(revision.ajustes)} {revision.ajustes === 1 ? 'ajuste' : 'ajustes'} de copia</>}.
          </p>
          {Object.keys(renombres).length > 0 && <p>Se cambiará el nombre de <b>{Object.keys(renombres).length}</b> {Object.keys(renombres).length === 1 ? 'planta' : 'plantas'} en Listados y en las listas, <b>sin perder su lista</b>: {Object.values(renombres).map((r) => `«${r.de.ship_to}» → «${r.a}»`).join(' · ')}.</p>}
          {aQuitar > 0 && <p><b className={styles.rojo}>Se quitará la lista completa de {nf.format(aQuitar)} {aQuitar === 1 ? 'planta' : 'plantas'}</b> que ya no vienen en el Excel (queda el respaldo para volver atrás).</p>}
          {aCrear > 0 && <p>Además se {aCrear === 1 ? 'creará 1 planta' : `crearán ${aCrear} plantas`} en <b>Listados</b> (con su cliente si es nuevo), para que las solicitudes las encuentren.</p>}
          <p>Antes de guardar se deja un respaldo de las listas actuales. Lo que está en amarillo o no aceptaste no se toca.</p>
          <p className={styles.servicioGuardar}>
            Solo cambia la lista de <EtiquetaServicio servicio={servicio} />
            {aCrear > 0 && <> y su listado de plantas</>}. Las de los demás servicios quedan igual.
          </p>
          {errorGuardar && <p className={styles.errorTexto} role="alert">{errorGuardar}</p>}
        </Modal>
      )}
    </div>
  )
}
