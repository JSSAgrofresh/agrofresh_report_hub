import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { IconArchivoPlano, IconCandado, IconCarpeta } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { formatDateTimeCL } from '@/lib/locale'
import { HttpError } from '@/services/http/client'
import {
  TIPO_MOVER,
  carpetaDe,
  crearCarpeta,
  descargar,
  descargarR2,
  eliminar,
  estaDentro,
  filtrarEntradas,
  formatoTamano,
  listar,
  listarR2,
  migasDe,
  mover,
  nombreVisible,
  ordenarEntradas,
  organizarSolicitudesR2,
  renombrar,
  rutasArrastradas,
  subirArchivos,
} from '@/features/storage'
import type { CampoOrden, EntradaStorage, Espacio, Orden } from '@/features/storage'
import { ArbolCarpetas } from './ArbolCarpetas'
import { Dialogo } from './Dialogo'
import styles from './StorageView.module.css'

type Estado =
  | { tipo: 'carpeta' }
  | { tipo: 'renombrar'; entrada: EntradaStorage }
  | { tipo: 'eliminar'; entradas: EntradaStorage[] }
  | { tipo: 'mover'; entradas: EntradaStorage[] }

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
}

/** Lo que se ve a la derecha del árbol: barra, buscador, tabla y ventanas. Se
 * monta de nuevo en cada carpeta (ver `key` en StorageView), así que
 * selección y búsqueda parten limpias sin código que las reinicie. */
export function Explorador({
  espacio,
  ruta,
  onNavegar,
  version,
  onCambio,
  esAdmin,
  puedeEscribir,
  onAbrirPermisos,
}: ExploradorProps) {
  const editable = espacio.editable && puedeEscribir
  const [entradas, setEntradas] = useState<EntradaStorage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>({ campo: 'nombre', descendente: false })
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState<Estado | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [sobre, setSobre] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vigente = true
    const pedir = espacio.r2 ? listarR2(ruta) : listar(ruta)
    pedir
      .then((r) => {
        if (!vigente) return
        setEntradas(r.entradas)
        setError(null)
      })
      .catch((e) => {
        if (!vigente) return
        setEntradas([])
        setError(mensajeDe(e, 'No se pudo leer esta carpeta. Revisa que el backend esté corriendo.'))
      })
    return () => {
      vigente = false
    }
  }, [espacio, ruta, version])

  const visibles = useMemo(
    () => ordenarEntradas(filtrarEntradas(entradas ?? [], busqueda), orden),
    [entradas, busqueda, orden],
  )
  const seleccionadas = visibles.filter((e) => seleccion.has(e.ruta))
  const todasMarcadas = visibles.length > 0 && seleccionadas.length === visibles.length

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

  const conError = useCallback(async (accion: () => Promise<void>, defecto: string) => {
    setError(null)
    setMensaje(null)
    setOcupado(true)
    try {
      await accion()
    } catch (e) {
      setError(mensajeDe(e, defecto))
    } finally {
      setOcupado(false)
    }
  }, [])

  async function subir(lista: FileList | File[]) {
    const archivos = Array.from(lista)
    if (archivos.length === 0) return
    await conError(async () => {
      await subirArchivos(ruta, archivos)
      setMensaje(`${archivos.length} archivo(s) subido(s).`)
      onCambio()
    }, 'No se pudo subir. Revisa que el backend esté corriendo.')
  }

  async function moverA(rutas: string[], destino: string) {
    const aMover = rutas.filter((r) => carpetaDe(r) !== destino && !estaDentro(destino, r))
    if (aMover.length === 0) return
    await conError(async () => {
      const fallos: string[] = []
      for (const r of aMover) {
        try {
          await mover(r, destino)
        } catch {
          fallos.push(r.split('/').pop() ?? r)
        }
      }
      setSeleccion(new Set())
      onCambio()
      if (fallos.length) setError(`No se pudo mover: ${fallos.join(', ')} (¿ya existe algo con ese nombre allí?).`)
      else setMensaje(`${aMover.length} elemento(s) movido(s).`)
    }, 'No se pudo mover.')
  }

  function empezarArrastre(e: DragEvent<HTMLTableRowElement>, entrada: EntradaStorage) {
    const rutas = seleccion.has(entrada.ruta) ? [...seleccion] : [entrada.ruta]
    e.dataTransfer.setData(TIPO_MOVER, JSON.stringify(rutas))
  }

  function alSoltarEnZona(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    if (!editable) return
    if (e.dataTransfer.types.includes(TIPO_MOVER)) return // mover se hace sobre una carpeta, no sobre la zona
    void subir(e.dataTransfer.files)
  }

  function alSoltarEnCarpeta(e: DragEvent<HTMLElement>, destino: string) {
    e.preventDefault()
    e.stopPropagation()
    setSobre(null)
    setArrastrando(false)
    const rutas = rutasArrastradas(e.dataTransfer.getData(TIPO_MOVER))
    if (rutas.length) void moverA(rutas, destino)
  }

  async function organizar() {
    await conError(async () => {
      const r = await organizarSolicitudesR2()
      setMensaje(
        `${r.movidas} solicitud(es) reorganizada(s).${r.omitidas ? ` ${r.omitidas} no pudieron moverse.` : ''}`,
      )
      onCambio()
    }, 'No se pudieron organizar las solicitudes existentes.')
  }

  const migas = migasDe(espacio, ruta)
  const descargarEntrada = espacio.r2 ? descargarR2 : descargar
  const arrastrable = editable

  return (
    <section className={styles.explorador}>
      <div className={styles.barra}>
        <nav className={styles.migas} aria-label="Ruta">
          {migas.map((m, i) => (
            <span key={m.ruta} className={styles.migaGrupo}>
              {i > 0 && <span className={styles.migaSeparador}>/</span>}
              <button
                type="button"
                className={cn(i === migas.length - 1 && styles.migaActiva, sobre === `miga:${m.ruta}` && styles.migaSobre)}
                onClick={() => onNavegar(m.ruta)}
                onDragOver={arrastrable ? (e) => { e.preventDefault(); setSobre(`miga:${m.ruta}`) } : undefined}
                onDragLeave={arrastrable ? () => setSobre(null) : undefined}
                onDrop={arrastrable ? (e) => alSoltarEnCarpeta(e, m.ruta) : undefined}
              >
                {m.etiqueta}
              </button>
            </span>
          ))}
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
          {editable && (
            <>
              <button type="button" className={styles.boton} onClick={() => setEstado({ tipo: 'carpeta' })}>
                + Nueva carpeta
              </button>
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
          placeholder="Buscar en esta carpeta…"
          aria-label="Buscar en esta carpeta"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span className={styles.contador}>
          {entradas === null ? '' : `${visibles.length} elemento${visibles.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {!espacio.editable && <p className={styles.soloLectura}>{espacio.descripcion}</p>}

      {seleccionadas.length > 0 && (
        <div className={styles.seleccion} role="status">
          <strong>{seleccionadas.length} seleccionado(s)</strong>
          {editable && (
            <>
              <button type="button" className={styles.boton} onClick={() => setEstado({ tipo: 'mover', entradas: seleccionadas })}>
                Mover a…
              </button>
              <button type="button" className={styles.botonEliminar} onClick={() => setEstado({ tipo: 'eliminar', entradas: seleccionadas })}>
                Eliminar
              </button>
            </>
          )}
          <button type="button" className={styles.boton} onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </button>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {mensaje && <p className={styles.ok} role="status">{mensaje}</p>}

      <div
        className={cn(styles.tablaCaja, arrastrando && editable && styles.zonaActiva)}
        onDragOver={editable ? (e) => { e.preventDefault(); if (!e.dataTransfer.types.includes(TIPO_MOVER)) setArrastrando(true) } : undefined}
        onDragLeave={editable ? () => setArrastrando(false) : undefined}
        onDrop={editable ? alSoltarEnZona : undefined}
        onClick={() => menu && setMenu(null)}
      >
        {entradas === null ? (
          <p className={styles.estado}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className={styles.estado}>
            {busqueda
              ? 'Nada coincide con la búsqueda.'
              : editable
                ? 'Carpeta vacía. Arrastra archivos aquí o usa «Subir archivos».'
                : 'Esta carpeta está vacía.'}
          </p>
        ) : (
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
                  draggable={arrastrable}
                  aria-selected={seleccion.has(e.ruta)}
                  className={cn(seleccion.has(e.ruta) && styles.filaMarcada, sobre === e.ruta && styles.filaSobrevolada)}
                  onDragStart={arrastrable ? (ev) => empezarArrastre(ev, e) : undefined}
                  onDragOver={arrastrable && e.tipo === 'carpeta' ? (ev) => { ev.preventDefault(); setSobre(e.ruta) } : undefined}
                  onDragLeave={arrastrable ? () => setSobre((s) => (s === e.ruta ? null : s)) : undefined}
                  onDrop={arrastrable && e.tipo === 'carpeta' ? (ev) => alSoltarEnCarpeta(ev, e.ruta) : undefined}
                >
                  <td className={styles.colCheck}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${e.nombre}`}
                      checked={seleccion.has(e.ruta)}
                      onChange={() => alternar(e.ruta)}
                    />
                  </td>
                  <td className={styles.nombre}>
                    {e.tipo === 'carpeta' ? (
                      <button type="button" className={styles.nombreCarpeta} onClick={() => onNavegar(e.ruta)}>
                        <IconCarpeta className={styles.icono} />
                        {nombreVisible(e.nombre)}
                      </button>
                    ) : (
                      <span className={styles.nombreArchivo}>
                        <IconArchivoPlano className={styles.icono} />
                        {e.nombre}
                      </span>
                    )}
                    {e.restringida && (
                      <span
                        className={styles.chipRestringida}
                        title={e.n_usuarios != null ? `Solo ${e.n_usuarios} cuenta(s) la ven` : 'Carpeta restringida'}
                      >
                        <IconCandado className={styles.iconoChip} />
                        {e.n_usuarios != null ? e.n_usuarios : 'Restringida'}
                      </span>
                    )}
                  </td>
                  <td className={styles.mono}>{formatoTamano(e.tamano_bytes)}</td>
                  <td className={styles.mono}>{e.modificado ? formatDateTimeCL(e.modificado) : '—'}</td>
                  <td className={cn(styles.celdaAcciones, menu === e.ruta && styles.celdaMenuAbierta)}>
                    <div className={styles.acciones}>
                    {e.tipo === 'archivo' && (
                      <button type="button" className={styles.boton} onClick={() => void descargarEntrada(e.ruta)}>
                        Descargar
                      </button>
                    )}
                    {(editable || (esAdmin && e.tipo === 'carpeta')) && (
                      <div className={styles.menuCaja}>
                        <button
                          type="button"
                          className={styles.boton}
                          aria-label={`Más acciones para ${e.nombre}`}
                          aria-expanded={menu === e.ruta}
                          onClick={(ev) => { ev.stopPropagation(); setMenu(menu === e.ruta ? null : e.ruta) }}
                        >
                          ⋯
                        </button>
                        {menu === e.ruta && (
                          <div
                            className={cn(styles.menu, visibles.length > 3 && indice >= visibles.length - 2 && styles.menuArriba)}
                            role="menu"
                          >
                            {editable && (
                              <button type="button" role="menuitem" onClick={() => { setMenu(null); setEstado({ tipo: 'renombrar', entrada: e }) }}>
                                Renombrar
                              </button>
                            )}
                            {editable && (
                              <button type="button" role="menuitem" onClick={() => { setMenu(null); setEstado({ tipo: 'mover', entradas: [e] }) }}>
                                Mover a…
                              </button>
                            )}
                            {esAdmin && e.tipo === 'carpeta' && (
                              <button type="button" role="menuitem" onClick={() => { setMenu(null); onAbrirPermisos(e.ruta) }}>
                                Permisos…
                              </button>
                            )}
                            {editable && (
                              <button type="button" role="menuitem" className={styles.menuPeligro} onClick={() => { setMenu(null); setEstado({ tipo: 'eliminar', entradas: [e] }) }}>
                                Eliminar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editable && (
        <p className={styles.ayuda}>
          Arrastra archivos desde tu computador para subirlos, o mueve elementos arrastrándolos a
          una carpeta, a la ruta de arriba o al árbol de la izquierda.
        </p>
      )}

      {estado?.tipo === 'carpeta' && (
        <DialogoNombre
          titulo="Nueva carpeta"
          etiqueta="Nombre de la carpeta"
          confirmar="Crear"
          onCerrar={() => setEstado(null)}
          onConfirmar={async (nombre) => {
            setEstado(null)
            await conError(async () => {
              await crearCarpeta(ruta, nombre)
              onCambio()
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
            await conError(async () => {
              await renombrar(entrada.ruta, nombre)
              onCambio()
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
            await conError(async () => {
              const fallos: string[] = []
              for (const e of lista) {
                try {
                  await eliminar(e.ruta)
                } catch {
                  fallos.push(e.nombre)
                }
              }
              setSeleccion(new Set())
              onCambio()
              if (fallos.length) setError(`No se pudo eliminar: ${fallos.join(', ')}.`)
              else setMensaje(`${lista.length} elemento(s) eliminado(s).`)
            }, 'No se pudo eliminar.')
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
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
        {hayCarpetas
          ? 'Se borra todo lo que hay dentro de las carpetas, y también sus permisos. '
          : ''}
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
  const valido = destino !== null && destino !== origen
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
        <ArbolCarpetas
          espacio={espacio}
          rutaActual={destino ?? origen}
          onNavegar={setDestino}
          version={version}
          bloqueadas={carpetas}
        />
      </div>
    </Dialogo>
  )
}
