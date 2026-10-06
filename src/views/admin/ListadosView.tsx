import { useMemo, useRef, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EtiquetaServicio, SelectorServicio } from '@/components/ui/SelectorServicio'
import { IconoAlerta } from '@/components/ui/iconosAccion'
import { cn } from '@/lib/cn'
import { ETIQUETA_SERVICIO, tieneListadoPropio } from '@/lib/servicio'
import type { Servicio, ServicioConListado } from '@/lib/servicio'
import {
  ClienteForm,
  ClientesTable,
  eliminarLoteActimist,
  PlantaForm,
  PlantasTable,
  useCatalogo,
} from '@/features/catalogo'
import type { Cliente, ClienteInput, Planta, PlantaInput } from '@/features/catalogo'
import { eliminarListadoLote, HomogenizarPanel, importarListado, importarMaestroListados, ValorListaForm, ValorListaTable, descargarListados, useListado } from '@/features/listados'
import type { TipoListado, ValorLista, ValorListaInput } from '@/features/listados'
import { ImportarActimistDialog } from './ImportarActimistDialog'
import styles from './ListadosView.module.css'

type Pestana = 'clientes' | 'plantas' | 'especie' | 'variedad'
type Panel =
  | { modo: 'lista' }
  | { modo: 'nuevoCliente' }
  | { modo: 'editarCliente'; cliente: Cliente }
  | { modo: 'nuevaPlanta'; clientePreseleccionado?: Cliente }
  | { modo: 'editarPlanta'; planta: Planta }
  | { modo: 'nuevoValor' }
  | { modo: 'editarValor'; valor: ValorLista }
  | { modo: 'homogenizar' }
  | { modo: 'importarActimist' }

const ETIQUETA_PESTANA: Record<Pestana, string> = {
  clientes: 'Sold To',
  plantas: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

/** Qué usa cada listado de Sold To / Ship To (se muestra bajo el selector). */
const USO_SERVICIO: Record<Servicio, string> = {
  linea: 'El de siempre. Lo usan Ingesta, Converter, Report y las solicitudes de Línea de proceso.',
  actimist: 'Lo usan las solicitudes con Tipo de Aplicación Actimist.',
  ecofog: 'Lo usan las solicitudes con Tipo de Aplicación Ecofog.',
}

export function ListadosView() {
  const maestroRef = useRef<HTMLInputElement>(null)
  // Sold To / Ship To tienen un listado por tipo de servicio. Especie y
  // Variedad son las mismas para los dos.
  const [servicio, setServicio] = useState<Servicio>('linea')
  const catalogoLinea = useCatalogo('linea')
  const catalogoActimist = useCatalogo('actimist')
  const catalogoEcofog = useCatalogo('ecofog')
  const catalogo = servicio === 'actimist' ? catalogoActimist : servicio === 'ecofog' ? catalogoEcofog : catalogoLinea
  const { clientes, plantas, cargando, error, refrescar: refrescarCatalogo, crearCliente, editarCliente, crearPlanta, editarPlanta } =
    catalogo
  const [pestana, setPestana] = useState<Pestana>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const tipoListado: TipoListado | null = pestana === 'especie' || pestana === 'variedad' ? pestana : null
  const esCatalogo = pestana === 'clientes' || pestana === 'plantas'
  // Actimist y Ecofog siguen las mismas reglas (listado propio, importar del Planner).
  const esActimist = esCatalogo && tieneListadoPropio(servicio)
  const [especieSeleccionadaId, setEspecieSeleccionadaId] = useState<number | null>(null)

  // Variedad siempre necesita una Especie elegida primero -por eso son dos
  // instancias del hook: una para la pestaña Especie (y para alimentar el
  // selector de especies), otra para Variedad, filtrada por la elegida-.
  const especiesListado = useListado('especie')
  const variedadListado = useListado('variedad', especieSeleccionadaId)
  const listado = pestana === 'especie' ? especiesListado : variedadListado
  const especiesActivas = especiesListado.valores.filter((e) => e.activo)

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.codigo_sap ?? '').toLowerCase().includes(q) ||
        (c.rut ?? '').toLowerCase().includes(q),
    )
  }, [clientes, busqueda])

  const plantasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return plantas
    return plantas.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.cliente_nombre.toLowerCase().includes(q) ||
        (p.codigo_sap ?? '').toLowerCase().includes(q) ||
        (p.ciudad ?? '').toLowerCase().includes(q),
    )
  }, [plantas, busqueda])

  const valoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return listado.valores
    return listado.valores.filter((v) => v.valor.toLowerCase().includes(q))
  }, [listado.valores, busqueda])

  const TOPE = 200
  const clientesVisibles = clientesFiltrados.slice(0, TOPE)
  const plantasVisibles = plantasFiltradas.slice(0, TOPE)
  const valoresVisibles = valoresFiltrados.slice(0, TOPE)

  async function guardarCliente(datos: ClienteInput) {
    setGuardando(true)
    setErrorGuardado(null)
    try {
      if (panel.modo === 'editarCliente') {
        await editarCliente(panel.cliente.id, datos)
      } else {
        await crearCliente(datos)
      }
      setPanel({ modo: 'lista' })
    } catch (e) {
      setErrorGuardado(mensajeGuardado(e, 'Sold To'))
    } finally {
      setGuardando(false)
    }
  }

  async function guardarPlanta(datos: PlantaInput) {
    setGuardando(true)
    setErrorGuardado(null)
    try {
      if (panel.modo === 'editarPlanta') {
        await editarPlanta(panel.planta.id, datos)
      } else {
        await crearPlanta(datos)
      }
      setPanel({ modo: 'lista' })
    } catch (e) {
      setErrorGuardado(mensajeGuardado(e, 'Ship To'))
    } finally {
      setGuardando(false)
    }
  }

  async function guardarValor(datos: ValorListaInput) {
    setGuardando(true)
    setErrorGuardado(null)
    try {
      if (panel.modo === 'editarValor') {
        await listado.editar(panel.valor.id, datos)
      } else {
        await listado.crear(datos)
      }
      setPanel({ modo: 'lista' })
    } catch {
      setErrorGuardado(`No se pudo guardar el valor de ${ETIQUETA_PESTANA[pestana]}. Puede que ya exista uno equivalente.`)
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstadoValor(valor: ValorLista) {
    await listado.editar(valor.id, { valor: valor.valor, activo: !valor.activo })
  }

  async function eliminarValor(valor: ValorLista) {
    if (!window.confirm(`¿Eliminar "${valor.valor}"? Esta acción no se puede deshacer.`)) return
    try {
      await listado.eliminar(valor.id)
    } catch {
      window.alert('No se pudo eliminar. Si el valor ya fue usado en una homogenización, solo puedes desactivarlo.')
    }
  }

  function mensajeGuardado(e: unknown, que: string) {
    // El backend explica los choques (nombre repetido) con un 409 claro.
    if (e instanceof Error && e.message && /Ya hay|ya tiene|no está/.test(e.message)) return e.message
    return `No se pudo guardar el ${que}. Revisa que el backend esté corriendo.`
  }

  async function importarArchivo(archivo: File) {
    const tipo = pestana === 'clientes' ? 'sold_to' : pestana === 'plantas' ? 'ship_to' : pestana
    try {
      const r = await importarListado(tipo, archivo, especieSeleccionadaId ?? undefined)
      window.alert(`${r.creados} valor(es) importados.`)
      if (pestana === 'clientes' || pestana === 'plantas') await refrescarCatalogo(); else await listado.refrescar()
    } catch { window.alert('No se pudo importar. Revisa el formato y las dependencias del listado.') }
  }

  async function importarMaestro(archivo: File) {
    try {
      const r = await importarMaestroListados(archivo)
      window.alert(`Maestro cargado: ${r.sold_to} Sold To, ${r.ship_to} Ship To, ${r.especie} especies y ${r.variedad} variedades procesadas.`)
      await Promise.all([refrescarCatalogo(), listado.refrescar()])
    } catch { window.alert('No se pudo importar el maestro. Revisa que incluya CROP, Variedad, SOLD TO2 y SHIP TO2.') }
    finally { if (maestroRef.current) maestroRef.current.value = '' }
  }

  async function eliminarFiltrados() {
    const ids = pestana === 'clientes' ? clientesFiltrados.map((x) => x.id) : pestana === 'plantas' ? plantasFiltradas.map((x) => x.id) : valoresFiltrados.map((x) => x.id)
    const donde = esCatalogo ? ` del listado de ${ETIQUETA_SERVICIO[servicio]}` : ''
    if (!ids.length || !window.confirm(`¿Eliminar los ${ids.length} resultados visibles del filtro actual${donde}?`)) return
    const tipo = pestana === 'clientes' ? 'sold_to' : pestana === 'plantas' ? 'ship_to' : pestana
    if (esActimist) {
      try {
        await eliminarLoteActimist(pestana === 'clientes' ? 'sold_to' : 'ship_to', ids, servicio as ServicioConListado)
        await refrescarCatalogo()
      } catch { window.alert(`No se pudieron eliminar del listado de ${ETIQUETA_SERVICIO[servicio]}.`) }
      return
    }
    try {
      await eliminarListadoLote(tipo, ids)
      if (pestana === 'clientes' || pestana === 'plantas') await refrescarCatalogo(); else await listado.refrescar()
    } catch { window.alert('No se pudieron eliminar algunos valores porque están en uso.') }
  }

  return (
    <div>
      <Header
        title="Listados"
        description="Fuente estandarizada de Sold To, Ship To, Especie y Variedad. El resto de la app lee sus valores activos desde acá."
        acciones={
          esActimist ? undefined : (
            <>
              <input ref={maestroRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const archivo = e.target.files?.[0]; if (archivo) void importarMaestro(archivo) }} />
              <Button onClick={() => maestroRef.current?.click()}>Importar maestro</Button>
              <button type="button" className={styles.botonDescarga} onClick={() => void descargarListados()}>Descargar Excel</button>
            </>
          )
        }
      />

      <Card>
        {panel.modo === 'lista' || panel.modo === 'importarActimist' ? (
          <>
            {esCatalogo ? (
              <div className={styles.servicio}>
                <SelectorServicio
                  valor={servicio}
                  onChange={(s) => { if (s === 'ryd') return; setServicio(s); setBusqueda('') }}
                  conteos={{
                    linea: catalogoLinea.error ? null : pestana === 'clientes' ? catalogoLinea.clientes.length : catalogoLinea.plantas.length,
                    actimist: catalogoActimist.error ? null : pestana === 'clientes' ? catalogoActimist.clientes.length : catalogoActimist.plantas.length,
                    ecofog: catalogoEcofog.error ? null : pestana === 'clientes' ? catalogoEcofog.clientes.length : catalogoEcofog.plantas.length,
                  }}
                  detalle={USO_SERVICIO}
                />
              </div>
            ) : (
              <p className={styles.notaCompartida}>
                {ETIQUETA_PESTANA[pestana]} es la misma para todos los tipos de servicio.
              </p>
            )}
            <div className={styles.tabs}>
              {(['clientes', 'plantas', 'especie', 'variedad'] as Pestana[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn(styles.tab, pestana === p && styles.tabActiva)}
                  onClick={() => {
                    setPestana(p)
                    setBusqueda('')
                  }}
                >
                  {ETIQUETA_PESTANA[p]}
                  {' '}
                  (
                  {p === 'clientes'
                    ? clientes.length
                    : p === 'plantas'
                      ? plantas.length
                      : p === 'especie'
                        ? especiesListado.valores.length
                        : p === pestana
                          ? variedadListado.valores.length
                          : ''}
                  )
                </button>
              ))}
            </div>

            {pestana === 'variedad' && (
              <div className={styles.selectorEspecie}>
                <label>
                  <span>Especie</span>
                  <select
                    value={especieSeleccionadaId ?? ''}
                    onChange={(e) => setEspecieSeleccionadaId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— elegir especie —</option>
                    {especiesActivas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.valor}
                      </option>
                    ))}
                  </select>
                </label>
                {!especieSeleccionadaId && (
                  <p className={styles.notaTope}>
                    Elige una especie para ver, crear y homogenizar sus variedades -"June Gold" de Durazno y
                    "June Gold" de Manzana son variedades distintas, nunca se mezclan-.
                  </p>
                )}
              </div>
            )}

            <div className={styles.cabeceraTabla}>
              <input
                className={styles.busqueda}
                placeholder={
                  pestana === 'clientes'
                    ? 'Buscar por nombre, N° Sold To o RUT…'
                    : pestana === 'plantas'
                      ? 'Buscar por nombre, cliente, N° Ship To o ciudad…'
                      : `Buscar ${ETIQUETA_PESTANA[pestana]}…`
                }
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {esCatalogo && <EtiquetaServicio servicio={servicio} className={styles.chipServicio} />}
              <div className={styles.accionesHeader}>
                <input ref={archivoRef} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarArchivo(f); e.currentTarget.value = '' }} />
                <Button
                  variant="secondary"
                  disabled={pestana === 'variedad' && !especieSeleccionadaId}
                  onClick={() => (esActimist ? setPanel({ modo: 'importarActimist' }) : archivoRef.current?.click())}
                >
                  Importar Excel
                </Button>
                <Button variant="secondary" onClick={() => void eliminarFiltrados()}>Eliminar en masa</Button>
                {tipoListado && (
                  <Button
                    variant="secondary"
                    disabled={pestana === 'variedad' && !especieSeleccionadaId}
                    onClick={() => setPanel({ modo: 'homogenizar' })}
                  >
                    Homogenizar
                  </Button>
                )}
                <Button
                  disabled={pestana === 'variedad' && !especieSeleccionadaId}
                  onClick={() =>
                    setPanel(
                      pestana === 'clientes'
                        ? { modo: 'nuevoCliente' }
                        : pestana === 'plantas'
                          ? { modo: 'nuevaPlanta' }
                          : { modo: 'nuevoValor' },
                    )
                  }
                >
                  Nuevo {ETIQUETA_PESTANA[pestana]}
                </Button>
              </div>
            </div>

            {(pestana === 'clientes' || pestana === 'plantas' ? cargando : listado.cargando) && (
              <p className={styles.estado}>Cargando…</p>
            )}
            {esCatalogo && error && (
              <div className={esActimist ? styles.avisoServicio : styles.estadoError} role="alert">
                {esActimist && <IconoAlerta width={18} height={18} />}
                <span>{error}</span>
                <Button variant="secondary" onClick={() => void refrescarCatalogo()}>Reintentar</Button>
              </div>
            )}
            {!esCatalogo && listado.error && <p className={styles.estadoError}>{listado.error}</p>}
            {esActimist && !cargando && !error && clientes.length === 0 && (
              <div className={styles.vacioServicio}>
                <EtiquetaServicio servicio={servicio} />
                <strong>El listado de {ETIQUETA_SERVICIO[servicio]} está vacío</strong>
                <span>Cárgalo desde la dinámica del Planner: verás qué se crea antes de guardar.</span>
                <Button onClick={() => setPanel({ modo: 'importarActimist' })}>Importar Excel de {ETIQUETA_SERVICIO[servicio]}</Button>
              </div>
            )}

            {pestana === 'clientes' && !cargando && !error && !(esActimist && clientes.length === 0) && (
              <>
                {clientesFiltrados.length > TOPE && (
                  <p className={styles.notaTope}>
                    Mostrando los primeros {TOPE} resultados de {clientesFiltrados.length}. Afina la búsqueda para ver
                    otros.
                  </p>
                )}
                <ClientesTable
                  clientes={clientesVisibles}
                  onEditar={(cliente) => setPanel({ modo: 'editarCliente', cliente })}
                  onNuevaSucursal={(cliente) => setPanel({ modo: 'nuevaPlanta', clientePreseleccionado: cliente })}
                />
              </>
            )}

            {pestana === 'plantas' && !cargando && !error && !(esActimist && clientes.length === 0) && (
              <>
                {plantasFiltradas.length > TOPE && (
                  <p className={styles.notaTope}>
                    Mostrando los primeros {TOPE} resultados de {plantasFiltradas.length}. Afina la búsqueda para ver
                    otros.
                  </p>
                )}
                <PlantasTable
                  plantas={plantasVisibles}
                  onEditar={(planta) => setPanel({ modo: 'editarPlanta', planta })}
                />
              </>
            )}

            {tipoListado && !(pestana === 'variedad' && !especieSeleccionadaId) && !listado.cargando && !listado.error && (
              <>
                {valoresFiltrados.length > TOPE && (
                  <p className={styles.notaTope}>
                    Mostrando los primeros {TOPE} resultados de {valoresFiltrados.length}. Afina la búsqueda para ver
                    otros.
                  </p>
                )}
                <ValorListaTable
                  valores={valoresVisibles}
                  onEditar={(valor) => setPanel({ modo: 'editarValor', valor })}
                  onCambiarEstado={cambiarEstadoValor}
                  onEliminar={eliminarValor}
                />
              </>
            )}
            {panel.modo === 'importarActimist' && (
              <ImportarActimistDialog
                servicio={tieneListadoPropio(servicio) ? servicio : 'actimist'}
                onCerrar={() => setPanel({ modo: 'lista' })}
                onCargado={() => void (servicio === 'ecofog' ? catalogoEcofog : catalogoActimist).refrescar()}
              />
            )}
          </>
        ) : panel.modo === 'nuevoCliente' || panel.modo === 'editarCliente' ? (
          <>
            <p className={styles.dondeSeGuarda}>Se guarda en el listado de <EtiquetaServicio servicio={servicio} /></p>
            {errorGuardado && <p className={styles.estadoError}>{errorGuardado}</p>}
            <ClienteForm
              cliente={panel.modo === 'editarCliente' ? panel.cliente : undefined}
              onGuardar={guardarCliente}
              onCancelar={() => setPanel({ modo: 'lista' })}
            />
            {guardando && <p className={styles.estado}>Guardando…</p>}
          </>
        ) : panel.modo === 'nuevaPlanta' || panel.modo === 'editarPlanta' ? (
          <>
            <p className={styles.dondeSeGuarda}>Se guarda en el listado de <EtiquetaServicio servicio={servicio} /></p>
            {errorGuardado && <p className={styles.estadoError}>{errorGuardado}</p>}
            <PlantaForm
              planta={panel.modo === 'editarPlanta' ? panel.planta : undefined}
              clientes={clientes}
              clientePreseleccionado={panel.modo === 'nuevaPlanta' ? panel.clientePreseleccionado : undefined}
              onGuardar={guardarPlanta}
              onCancelar={() => setPanel({ modo: 'lista' })}
            />
            {guardando && <p className={styles.estado}>Guardando…</p>}
          </>
        ) : panel.modo === 'nuevoValor' || panel.modo === 'editarValor' ? (
          <>
            {errorGuardado && <p className={styles.estadoError}>{errorGuardado}</p>}
            <ValorListaForm
              tipo={tipoListado ?? 'especie'}
              valorExistente={panel.modo === 'editarValor' ? panel.valor : undefined}
              onGuardar={guardarValor}
              onCancelar={() => setPanel({ modo: 'lista' })}
            />
            {guardando && <p className={styles.estado}>Guardando…</p>}
          </>
        ) : (
          <HomogenizarPanel
            tipo={tipoListado ?? 'especie'}
            especieId={especieSeleccionadaId ?? undefined}
            onCerrar={() => setPanel({ modo: 'lista' })}
            onAplicado={listado.refrescar}
          />
        )}
      </Card>
    </div>
  )
}
