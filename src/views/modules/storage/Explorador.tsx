import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { IconCandado } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { formatDateTimeCL } from '@/lib/locale'
import { HttpError } from '@/services/http/client'
import {
  TIPO_MOVER,
  carpetaDe,
  estaDentro,
  filtrarEntradas,
  formatoTamano,
  leerArrastre,
  migasDe,
  nombreVisible,
  operaciones,
  ordenarEntradas,
  organizarSolicitudesR2,
  puede,
} from '@/features/storage'
import type { CampoOrden, EntradaStorage, Espacio, Operacion, Orden } from '@/features/storage'
import { ArbolCarpetas } from './ArbolCarpetas'
import { Dialogo } from './Dialogo'
import { IconoArchivo, IconoCarpeta } from './IconoArchivo'
import { VistaPrevia } from './VistaPrevia'
import styles from './StorageView.module.css'

type Estado =
  | { tipo: 'carpeta' }
  | { tipo: 'renombrar'; entrada: EntradaStorage }
  | { tipo: 'eliminar'; entradas: EntradaStorage[] }
  | { tipo: 'mover'; entradas: EntradaStorage[] }

type Vista = 'lista' | 'cuadricula'
const CLAVE_VISTA = 'agrofresh.storage.vista.v1'

function vistaGuardada(): Vista {
  try {
    return window.localStorage.getItem(CLAVE_VISTA) === 'cuadricula' ? 'cuadricula' : 'lista'
  } catch {
    return 'lista'
  }
}

function mensajeDe(e: unknown, defecto: string): string {
  return e instanceof HttpError && e.message && !e.message.startsWith('Request failed') ? e.message : defecto
}

interface ExploradorProps {
  espacio: Espacio
  ruta: string
  onNavegar: (ruta: string) => void
  /** Cambia cuando algo se movió/creó/borró en cualquier parte; relee el listado. */
  version: number
  /** Avisa que hubo un cambio para que el árbol y los demás se relean. */
  onCambio: () => void
  esAdmin: boolean
  puedeEscribir: boolean
  onAbrirPermisos: (ruta: string) => void
  esFavorito: boolean
  onAlternarFavorito: (ruta: string, nombre: string) => void
  avisar: (tipo: 'ok' | 'error', texto: string) => void
  /** Archivo al que llegó la búsqueda: se resalta un momento. */
  resaltar: string | null
}

/** Lo que se ve a la derecha del árbol. Se monta de nuevo en cada carpeta (ver
 * `key` en StorageView): selección y filtro parten limpios sin código que los reinicie. */
export function Explorador({
  espacio,
  ruta,
  onNavegar,
  version,
  onCambio,
  esAdmin,
  puedeEscribir,
  onAbrirPermisos,
  esFavorito,
  onAlternarFavorito,
  avisar,
  resaltar,
}: ExploradorProps) {
  const ops = useMemo(() => operaciones(espacio), [espacio])
  const [entradas, setEntradas] = useState<EntradaStorage[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>({ campo: 'nombre', descendente: false })
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState<Estado | null>(null)
  const [previa, setPrevia] = useState<EntradaStorage | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [sobre, setSobre] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const admite = useCallback(
    (op: Operacion, r: string, esCarpeta = true) => puedeEscribir && puede(espacio, op, r, esCarpeta),
    [espacio, puedeEscribir],
  )
  const puedeCrear = admite('crear', ruta)
  const puedeSubir = admite('subir', ruta)
  const sobreEntrada = (op: Operacion, e: EntradaStorage) => admite(op, e.ruta, e.tipo === 'carpeta')

  useEffect(() => {
    let vigente = true
    ops
      .listar(ruta)
      .then((r) => {
        if (!vigente) return
        setEntradas(r.entradas)
        setErrorLista(null)
      })
      .catch((e) => {
        if (!vigente) return
        setEntradas([])
        setErrorLista(mensajeDe(e, 'No se pudo leer esta carpeta. Revisa que el backend esté corriendo.'))
      })
    return () => {
      vigente = false
    }
  }, [ops, ruta, version])

  const visibles = useMemo(
    () => ordenarEntradas(filtrarEntradas(entradas ?? [], busqueda), orden),
    [entradas, busqueda, orden],
  )
  const seleccionadas = visibles.filter((e) => seleccion.has(e.ruta))
  const todasMarcadas = visibles.length > 0 && seleccionadas.length === visibles.length
  const nCarpetas = (entradas ?? []).filter((e) => e.tipo === 'carpeta').length
  const nArchivos = (entradas ?? []).length - nCarpetas
  const pesoTotal = (entradas ?? []).reduce((suma, e) => suma + (e.tamano_bytes ?? 0), 0)

  function cambiarVista(v: Vista) {
    setVista(v)
    try {
      window.localStorage.setItem(CLAVE_VISTA, v)
    } catch {
      // sin almacenamiento: la elección dura lo que dure la pantalla
    }
  }

  function ordenarPor(campo: CampoOrden) {
    setOrden((o) => (o.campo === campo ? { campo, descendente: !o.descendente } : { campo, descendente: false }))
  }

  function marcarTodas() {
    setSeleccion(todasMarcadas ? new Set() : new Set(visibles.map((e) => e.ruta)))
  }

  function alternar(rutaEntrada: string) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (!n.delete(rutaEntrada)) n.add(rutaEntrada)
      return n
    })
  }

  const conAviso = useCallback(
    async (accion: () => Promise<string | void>, defecto: string) => {
      setOcupado(true)
      try {
        const texto = await accion()
        if (texto) avisar('ok', texto)
      } catch (e) {
        avisar('error', mensajeDe(e, defecto))
      } finally {
        setOcupado(false)
      }
    },
    [avisar],
  )

  async function subir(lista: FileList | File[]) {
    const archivos = Array.from(lista)
    if (archivos.length === 0) return
    await conAviso(async () => {
      await ops.subir(ruta, archivos)
      onCambio()
      return archivos.length === 1 ? `«${archivos[0].name}» subido.` : `${archivos.length} archivos subidos.`
    }, 'No se pudo subir. Revisa que el backend esté corriendo.')
  }

  async function moverA(rutas: string[], destino: string) {
    const aMover = rutas.filter((r) => carpetaDe(r) !== destino && !estaDentro(destino, r))
    if (aMover.length === 0) return
    await conAviso(async () => {
      const fallos: string[] = []
      for (const r of aMover) {
        try {
          await ops.mover(r, destino)
        } catch {
          fallos.push(r.split('/').pop() ?? r)
        }
      }
      setSeleccion(new Set())
      onCambio()
      if (fallos.length) throw new Error(`No se pudo mover: ${fallos.join(', ')}.`)
      return `${aMover.length} elemento(s) movido(s).`
    }, 'No se pudo mover.')
  }

  async function eliminarLista(lista: EntradaStorage[]) {
    await conAviso(async () => {
      const fallos: string[] = []
      for (const e of lista) {
        try {
          await ops.eliminar(e.ruta)
        } catch {
          fallos.push(e.nombre)
        }
      }
      setSeleccion(new Set())
      onCambio()
      if (fallos.length) throw new Error(`No se pudo eliminar: ${fallos.join(', ')}.`)
      return `${lista.length} elemento(s) eliminado(s).`
    }, 'No se pudo eliminar.')
  }

  function empezarArrastre(e: DragEvent<HTMLElement>, entrada: EntradaStorage) {
    const base = seleccion.has(entrada.ruta) ? [...seleccion] : [entrada.ruta]
    const movibles = base.filter((r) => admite('mover', r, entradas?.find((x) => x.ruta === r)?.tipo === 'carpeta'))
    e.dataTransfer.setData(TIPO_MOVER, JSON.stringify({ espacio: espacio.id, rutas: movibles }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function alSoltarEnZona(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    if (!puedeSubir || e.dataTransfer.types.includes(TIPO_MOVER)) return
    void subir(e.dataTransfer.files)
  }

  function alSoltarEnCarpeta(e: DragEvent<HTMLElement>, destino: string) {
    e.preventDefault()
    e.stopPropagation()
    setSobre(null)
    setArrastrando(false)
    const arrastre = leerArrastre(e.dataTransfer.getData(TIPO_MOVER))
    if (arrastre && arrastre.espacio === espacio.id && arrastre.rutas.length) void moverA(arrastre.rutas, destino)
  }

  async function organizar() {
    await conAviso(async () => {
      const r = await organizarSolicitudesR2()
      onCambio()
      return `${r.movidas} solicitud(es) reorganizada(s).${r.omitidas ? ` ${r.omitidas} no pudieron moverse.` : ''}`
    }, 'No se pudieron organizar las solicitudes existentes.')
  }

  function abrir(e: EntradaStorage) {
    if (e.tipo === 'carpeta') onNavegar(e.ruta)
    else setPrevia(e)
  }

  // Atajos: Supr elimina, F2 renombra, Esc quita la selección.
  useEffect(() => {
    function alTeclear(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement
      if (estado || previa || t.closest('input,textarea,select,[contenteditable]')) return
      if (ev.key === 'Escape') setSeleccion(new Set())
      if (ev.key === 'Delete' && seleccionadas.length && seleccionadas.every((e) => sobreEntrada('eliminar', e))) {
        setEstado({ tipo: 'eliminar', entradas: seleccionadas })
      }
      if (ev.key === 'F2' && seleccionadas.length === 1 && sobreEntrada('renombrar', seleccionadas[0])) {
        ev.preventDefault()
        setEstado({ tipo: 'renombrar', entrada: seleccionadas[0] })
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const migas = migasDe(espacio, ruta)
  const puedeMoverSel = seleccionadas.length > 0 && seleccionadas.every((e) => sobreEntrada('mover', e))
  const puedeEliminarSel = seleccionadas.length > 0 && seleccionadas.every((e) => sobreEntrada('eliminar', e))
  const hayMenu = (e: EntradaStorage) =>
    sobreEntrada('renombrar', e) || sobreEntrada('mover', e) || sobreEntrada('eliminar', e) || e.tipo === 'carpeta'

  function menuDe(e: EntradaStorage, indice: number, arriba: boolean) {
    if (!hayMenu(e)) return null
    return (
      <div className={cn(styles.menuCaja, menu === e.ruta && styles.menuCajaAbierta)}>
        <button
          type="button"
          className={styles.botonMenu}
          aria-label={`Más acciones para ${e.nombre}`}
          aria-expanded={menu === e.ruta}
          onClick={(ev) => {
            ev.stopPropagation()
            setMenu(menu === e.ruta ? null : e.ruta)
          }}
        >
          ⋯
        </button>
        {menu === e.ruta && (
          <div className={cn(styles.menu, (arriba || (visibles.length > 3 && indice >= visibles.length - 2)) && styles.menuArriba)} role="menu">
            {e.tipo === 'archivo' && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); setPrevia(e) }}>
                Vista previa
              </button>
            )}
            {e.tipo === 'carpeta' && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); onAlternarFavorito(e.ruta, e.nombre) }}>
                Fijar en favoritos
              </button>
            )}
            {sobreEntrada('renombrar', e) && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); setEstado({ tipo: 'renombrar', entrada: e }) }}>
                Renombrar
              </button>
            )}
            {sobreEntrada('mover', e) && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); setEstado({ tipo: 'mover', entradas: [e] }) }}>
                Mover a…
              </button>
            )}
            {esAdmin && e.tipo === 'carpeta' && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); onAbrirPermisos(e.ruta) }}>
                Permisos…
              </button>
            )}
            {sobreEntrada('eliminar', e) && (
              <button type="button" role="menuitem" className={styles.menuPeligro} onClick={() => { setMenu(null); setEstado({ tipo: 'eliminar', entradas: [e] }) }}>
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function propiedadesFila(e: EntradaStorage) {
    const movible = sobreEntrada('mover', e)
    const recibe = e.tipo === 'carpeta' && admite('crear', e.ruta)
    return {
      draggable: movible,
      onDragStart: movible ? (ev: DragEvent<HTMLElement>) => empezarArrastre(ev, e) : undefined,
      onDragOver: recibe ? (ev: DragEvent<HTMLElement>) => { ev.preventDefault(); setSobre(e.ruta) } : undefined,
      onDragLeave: recibe ? () => setSobre((s) => (s === e.ruta ? null : s)) : undefined,
      onDrop: recibe ? (ev: DragEvent<HTMLElement>) => alSoltarEnCarpeta(ev, e.ruta) : undefined,
    }
  }

  const nombreDe = (e: EntradaStorage) => (e.tipo === 'carpeta' ? nombreVisible(e.nombre) : e.nombre)

  return (
    <section className={styles.explorador} style={{ '--acento': espacio.acento } as React.CSSProperties}>
      <div className={styles.barra}>
        <nav className={styles.migas} aria-label="Ruta">
          {migas.map((m, i) => (
            <span key={m.ruta} className={styles.migaGrupo}>
              {i > 0 && <span className={styles.migaSeparador}>›</span>}
              <button
                type="button"
                className={cn(i === migas.length - 1 && styles.migaActiva, sobre === `miga:${m.ruta}` && styles.migaSobre)}
                onClick={() => onNavegar(m.ruta)}
                onDragOver={admite('crear', m.ruta) ? (e) => { e.preventDefault(); setSobre(`miga:${m.ruta}`) } : undefined}
                onDragLeave={() => setSobre(null)}
                onDrop={admite('crear', m.ruta) ? (e) => alSoltarEnCarpeta(e, m.ruta) : undefined}
              >
                {m.etiqueta}
              </button>
            </span>
          ))}
          {ruta !== espacio.raiz && (
          <button
            type="button"
            className={cn(styles.estrella, esFavorito && styles.estrellaOn)}
            aria-pressed={esFavorito}
            aria-label={esFavorito ? 'Quitar de favoritos' : 'Fijar en favoritos'}
            title={esFavorito ? 'Quitar de favoritos' : 'Fijar en favoritos'}
            onClick={() => onAlternarFavorito(ruta, migas[migas.length - 1].etiqueta)}
          >
            ★
          </button>
          )}
        </nav>
        <div className={styles.herramientas}>
          {espacio.permiteOrganizar && puedeEscribir && (
            <button type="button" className={styles.boton} onClick={() => void organizar()} disabled={ocupado}>
              Organizar existentes
            </button>
          )}
          {esAdmin && (
            <button type="button" className={styles.boton} onClick={() => onAbrirPermisos(ruta)}>
              <IconCandado className={styles.iconoBoton} /> Permisos
            </button>
          )}
          {puedeCrear && (
            <button type="button" className={styles.boton} onClick={() => setEstado({ tipo: 'carpeta' })}>
              + Nueva carpeta
            </button>
          )}
          {puedeSubir && (
            <>
              <button type="button" className={styles.botonPrimario} onClick={() => inputRef.current?.click()} disabled={ocupado}>
                {ocupado ? 'Procesando…' : 'Subir archivos'}
              </button>
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && void subir(e.target.files)} />
            </>
          )}
        </div>
      </div>

      <div className={styles.filtros}>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Filtrar esta carpeta…"
          aria-label="Filtrar esta carpeta"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className={styles.vistas} role="group" aria-label="Vista">
          <button type="button" className={cn(styles.vistaBoton, vista === 'lista' && styles.vistaActiva)} aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')} title="Lista">
            <svg viewBox="0 0 20 20" aria-hidden><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          </button>
          <button type="button" className={cn(styles.vistaBoton, vista === 'cuadricula' && styles.vistaActiva)} aria-pressed={vista === 'cuadricula'} onClick={() => cambiarVista('cuadricula')} title="Cuadrícula">
            <svg viewBox="0 0 20 20" aria-hidden><rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" /></svg>
          </button>
        </div>
        {vista === 'cuadricula' && (
          <select className={styles.selectOrden} aria-label="Ordenar por" value={orden.campo} onChange={(e) => setOrden({ campo: e.target.value as CampoOrden, descendente: false })}>
            <option value="nombre">Nombre</option>
            <option value="tamano">Tamaño</option>
            <option value="modificado">Fecha</option>
          </select>
        )}
        <span className={styles.contador}>
          {entradas === null
            ? ''
            : `${nCarpetas} carpeta${nCarpetas === 1 ? '' : 's'} · ${nArchivos} archivo${nArchivos === 1 ? '' : 's'}${pesoTotal ? ` · ${formatoTamano(pesoTotal)}` : ''}`}
        </span>
      </div>

      {seleccionadas.length > 0 && (
        <div className={styles.seleccion} role="status">
          <strong>{seleccionadas.length} seleccionado(s)</strong>
          {puedeMoverSel && (
            <button type="button" className={styles.boton} onClick={() => setEstado({ tipo: 'mover', entradas: seleccionadas })}>
              Mover a…
            </button>
          )}
          {puedeEliminarSel && (
            <button type="button" className={styles.botonEliminar} onClick={() => setEstado({ tipo: 'eliminar', entradas: seleccionadas })}>
              Eliminar
            </button>
          )}
          <button type="button" className={styles.boton} onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </button>
        </div>
      )}

      {errorLista && <p className={styles.error} role="alert">{errorLista}</p>}

      <div
        className={cn(styles.tablaCaja, arrastrando && puedeSubir && styles.zonaActiva)}
        onDragOver={puedeSubir ? (e) => { e.preventDefault(); if (!e.dataTransfer.types.includes(TIPO_MOVER)) setArrastrando(true) } : undefined}
        onDragLeave={puedeSubir ? () => setArrastrando(false) : undefined}
        onDrop={puedeSubir ? alSoltarEnZona : undefined}
        onClick={() => menu && setMenu(null)}
      >
        {arrastrando && puedeSubir && <div className={styles.cartelSoltar}>Suelta los archivos para subirlos aquí</div>}

        {entradas === null ? (
          <div className={styles.esqueleto} aria-label="Cargando">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.esqueletoFila} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <div className={styles.vacio}>
            <IconoCarpeta grande color={espacio.acento} />
            <p className={styles.vacioTitulo}>{busqueda ? 'Nada coincide con el filtro' : 'Esta carpeta está vacía'}</p>
            {!busqueda && puedeSubir && <p>Arrastra archivos aquí o usa «Subir archivos».</p>}
            {!busqueda && !puedeSubir && puedeCrear && <p>Crea una carpeta con «+ Nueva carpeta».</p>}
          </div>
        ) : vista === 'lista' ? (
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th className={styles.colCheck}>
                  <input type="checkbox" aria-label="Seleccionar todo" checked={todasMarcadas} onChange={marcarTodas} />
                </th>
                <ThOrden campo="nombre" orden={orden} onOrdenar={ordenarPor}>Nombre</ThOrden>
                <ThOrden campo="tamano" orden={orden} onOrdenar={ordenarPor}>Tamaño</ThOrden>
                <ThOrden campo="modificado" orden={orden} onOrdenar={ordenarPor}>Modificado</ThOrden>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((e, indice) => (
                <tr
                  key={e.ruta}
                  {...propiedadesFila(e)}
                  ref={e.ruta === resaltar ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
                  aria-selected={seleccion.has(e.ruta)}
                  className={cn(
                    styles.fila,
                    seleccion.has(e.ruta) && styles.filaMarcada,
                    sobre === e.ruta && styles.filaSobrevolada,
                    e.ruta === resaltar && styles.filaResaltada,
                  )}
                  style={{ animationDelay: `${Math.min(indice, 14) * 22}ms` }}
                >
                  <td className={styles.colCheck}>
                    <input type="checkbox" aria-label={`Seleccionar ${e.nombre}`} checked={seleccion.has(e.ruta)} onChange={() => alternar(e.ruta)} />
                  </td>
                  <td className={styles.nombre}>
                    <button type="button" className={styles.nombreBoton} onClick={() => abrir(e)}>
                      {e.tipo === 'carpeta' ? <IconoCarpeta restringida={e.restringida} /> : <IconoArchivo nombre={e.nombre} />}
                      <span className={styles.nombreTexto}>{nombreDe(e)}</span>
                    </button>
                    {e.restringida && (
                      <span className={styles.chipRestringida} title={e.n_usuarios != null ? `Solo ${e.n_usuarios} cuenta(s) la ven` : 'Carpeta restringida'}>
                        <IconCandado className={styles.iconoChip} />
                        {e.n_usuarios != null ? e.n_usuarios : 'Restringida'}
                      </span>
                    )}
                  </td>
                  <td className={styles.mono}>{formatoTamano(e.tamano_bytes)}</td>
                  <td className={styles.mono}>{e.modificado ? formatDateTimeCL(e.modificado) : '—'}</td>
                  <td className={styles.celdaAcciones + (menu === e.ruta ? ` ${styles.celdaMenuAbierta}` : '')}>
                    <div className={styles.acciones}>
                      {e.tipo === 'archivo' && (
                        <button type="button" className={styles.boton} onClick={() => void ops.descargar(e.ruta)}>
                          Descargar
                        </button>
                      )}
                      {menuDe(e, indice, false)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.cuadricula}>
            {visibles.map((e, indice) => (
              <div
                key={e.ruta}
                {...propiedadesFila(e)}
                ref={e.ruta === resaltar ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
                className={cn(
                  styles.tarjeta,
                  seleccion.has(e.ruta) && styles.tarjetaMarcada,
                  sobre === e.ruta && styles.filaSobrevolada,
                  e.ruta === resaltar && styles.filaResaltada,
                  menu === e.ruta && styles.tarjetaMenu,
                )}
                style={{ animationDelay: `${Math.min(indice, 14) * 22}ms` }}
              >
                <input
                  type="checkbox"
                  className={styles.tarjetaCheck}
                  aria-label={`Seleccionar ${e.nombre}`}
                  checked={seleccion.has(e.ruta)}
                  onChange={() => alternar(e.ruta)}
                />
                <div className={styles.tarjetaMenuPos}>{menuDe(e, indice, false)}</div>
                <button type="button" className={styles.tarjetaCuerpo} onClick={() => abrir(e)} title={e.nombre}>
                  {e.tipo === 'carpeta' ? <IconoCarpeta grande restringida={e.restringida} /> : <IconoArchivo nombre={e.nombre} grande />}
                  <span className={styles.tarjetaNombre}>{nombreDe(e)}</span>
                  <small className={styles.tarjetaMeta}>
                    {e.tipo === 'archivo' ? formatoTamano(e.tamano_bytes) : e.restringida ? 'Restringida' : 'Carpeta'}
                  </small>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className={styles.ayuda}>
        {puedeSubir || puedeCrear
          ? 'Arrastra archivos para subirlos o elementos a una carpeta para moverlos. Atajos: F2 renombra, Supr elimina, / busca en todo Storage.'
          : 'Haz clic en un archivo para ver su vista previa. Atajo: / busca en todo Storage.'}
      </p>

      {estado?.tipo === 'carpeta' && (
        <DialogoNombre
          titulo="Nueva carpeta"
          etiqueta="Nombre de la carpeta"
          confirmar="Crear"
          onCerrar={() => setEstado(null)}
          onConfirmar={async (nombre) => {
            setEstado(null)
            await conAviso(async () => {
              await ops.crearCarpeta(ruta, nombre)
              onCambio()
              return `Carpeta «${nombre}» creada.`
            }, 'No se pudo crear la carpeta.')
          }}
        />
      )}

      {estado?.tipo === 'renombrar' && (
        <DialogoNombre
          titulo={`Renombrar ${estado.entrada.tipo}`}
          etiqueta="Nuevo nombre"
          confirmar="Renombrar"
          inicial={estado.entrada.nombre}
          onCerrar={() => setEstado(null)}
          onConfirmar={async (nombre) => {
            const entrada = estado.entrada
            setEstado(null)
            if (nombre === entrada.nombre) return
            await conAviso(async () => {
              await ops.renombrar(entrada.ruta, nombre)
              onCambio()
              return `Renombrado a «${nombre}».`
            }, 'No se pudo renombrar (¿ya existe algo con ese nombre?).')
          }}
        />
      )}

      {estado?.tipo === 'eliminar' && (
        <DialogoEliminar
          entradas={estado.entradas}
          onCerrar={() => setEstado(null)}
          onConfirmar={async () => {
            const lista = estado.entradas
            setEstado(null)
            await eliminarLista(lista)
          }}
        />
      )}

      {estado?.tipo === 'mover' && (
        <DialogoMover
          espacio={espacio}
          entradas={estado.entradas}
          origen={ruta}
          version={version}
          onCerrar={() => setEstado(null)}
          onConfirmar={async (destino) => {
            const lista = estado.entradas
            setEstado(null)
            await moverA(lista.map((e) => e.ruta), destino)
          }}
        />
      )}

      {previa && (
        <VistaPrevia
          entrada={previa}
          abrir={ops.abrir}
          onDescargar={() => void ops.descargar(previa.ruta)}
          onCerrar={() => setPrevia(null)}
        />
      )}
    </section>
  )
}

function ThOrden({
  campo,
  orden,
  onOrdenar,
  children,
}: {
  campo: CampoOrden
  orden: Orden
  onOrdenar: (campo: CampoOrden) => void
  children: string
}) {
  const activo = orden.campo === campo
  return (
    <th aria-sort={activo ? (orden.descendente ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={styles.thBoton} onClick={() => onOrdenar(campo)}>
        {children}
        <span aria-hidden className={styles.flechaOrden}>{activo ? (orden.descendente ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  )
}

function DialogoNombre({
  titulo,
  etiqueta,
  confirmar,
  inicial = '',
  onCerrar,
  onConfirmar,
}: {
  titulo: string
  etiqueta: string
  confirmar: string
  inicial?: string
  onCerrar: () => void
  onConfirmar: (nombre: string) => void | Promise<void>
}) {
  const [nombre, setNombre] = useState(inicial)
  const limpio = nombre.trim()
  return (
    <Dialogo
      titulo={titulo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className={styles.boton} onClick={onCerrar}>Cancelar</button>
          <button type="button" className={styles.botonPrimario} disabled={!limpio} onClick={() => void onConfirmar(limpio)}>
            {confirmar}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (limpio) void onConfirmar(limpio)
        }}
      >
        <label className={styles.campo}>
          {etiqueta}
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
      </form>
    </Dialogo>
  )
}

function DialogoEliminar({
  entradas,
  onCerrar,
  onConfirmar,
}: {
  entradas: EntradaStorage[]
  onCerrar: () => void
  onConfirmar: () => void | Promise<void>
}) {
  const hayCarpetas = entradas.some((e) => e.tipo === 'carpeta')
  return (
    <Dialogo
      titulo={entradas.length === 1 ? `Eliminar «${entradas[0].nombre}»` : `Eliminar ${entradas.length} elementos`}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className={styles.boton} onClick={onCerrar}>Cancelar</button>
          <button type="button" className={styles.botonPeligro} onClick={() => void onConfirmar()}>Eliminar</button>
        </>
      }
    >
      <p>
        {hayCarpetas ? 'Se borra todo lo que hay dentro de las carpetas, y también sus permisos. ' : ''}
        Esta acción no se puede deshacer.
      </p>
      {entradas.length > 1 && (
        <ul className={styles.listaDialogo}>
          {entradas.map((e) => <li key={e.ruta}>{e.nombre}</li>)}
        </ul>
      )}
    </Dialogo>
  )
}

function DialogoMover({
  espacio,
  entradas,
  origen,
  version,
  onCerrar,
  onConfirmar,
}: {
  espacio: Espacio
  entradas: EntradaStorage[]
  origen: string
  version: number
  onCerrar: () => void
  onConfirmar: (destino: string) => void | Promise<void>
}) {
  const [destino, setDestino] = useState<string | null>(null)
  const carpetas = entradas.filter((e) => e.tipo === 'carpeta').map((e) => e.ruta)
  const valido = destino !== null && destino !== origen && puede(espacio, 'crear', destino)
  return (
    <Dialogo
      titulo={entradas.length === 1 ? `Mover «${entradas[0].nombre}»` : `Mover ${entradas.length} elementos`}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className={styles.boton} onClick={onCerrar}>Cancelar</button>
          <button type="button" className={styles.botonPrimario} disabled={!valido} onClick={() => destino !== null && void onConfirmar(destino)}>
            Mover aquí
          </button>
        </>
      }
    >
      <p className={styles.ayudaDialogo}>Elige la carpeta de destino.</p>
      <div className={styles.selectorArbol}>
        <ArbolCarpetas espacio={espacio} rutaActual={destino ?? origen} onNavegar={setDestino} version={version} bloqueadas={carpetas} />
      </div>
    </Dialogo>
  )
}
