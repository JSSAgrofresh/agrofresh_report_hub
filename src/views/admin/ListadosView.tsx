import { useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  ClienteForm,
  ClientesTable,
  PlantaForm,
  PlantasTable,
  useCatalogo,
} from '@/features/catalogo'
import type { Cliente, ClienteInput, Planta, PlantaInput } from '@/features/catalogo'
import { EstandaresPanel, HomogenizarPanel, ValorListaForm, ValorListaTable, useListado } from '@/features/listados'
import type { TipoListado, ValorLista, ValorListaInput } from '@/features/listados'
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
  | { modo: 'estandares' }

const ETIQUETA_PESTANA: Record<Pestana, string> = {
  clientes: 'Sold To',
  plantas: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

export function ListadosView() {
  const { clientes, plantas, cargando, error, crearCliente, editarCliente, crearPlanta, editarPlanta } =
    useCatalogo()
  const [pestana, setPestana] = useState<Pestana>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const tipoListado: TipoListado | null = pestana === 'especie' || pestana === 'variedad' ? pestana : null
  const listado = useListado(tipoListado ?? 'especie')

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
    } catch {
      setErrorGuardado('No se pudo guardar el Sold To. Revisa que el backend esté corriendo.')
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
    } catch {
      setErrorGuardado('No se pudo guardar el Ship To. Revisa que el backend esté corriendo.')
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

  return (
    <div>
      <Header
        title="Listados"
        description="Fuente estandarizada de Sold To, Ship To, Especie y Variedad. El resto de la app lee sus valores activos desde acá."
      />

      <Card>
        {panel.modo === 'lista' ? (
          <>
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
                      : p === pestana
                        ? listado.valores.length
                        : ''}
                  )
                </button>
              ))}
            </div>

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
              <div className={styles.accionesHeader}>
                {tipoListado && (
                  <Button variant="secondary" onClick={() => setPanel({ modo: 'homogenizar' })}>
                    Homogenizar
                  </Button>
                )}
                {tipoListado && (
                  <Button variant="secondary" onClick={() => setPanel({ modo: 'estandares' })}>
                    Variedades estándar
                  </Button>
                )}
                <Button
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
            {(pestana === 'clientes' || pestana === 'plantas' ? error : listado.error) && (
              <p className={styles.estadoError}>{pestana === 'clientes' || pestana === 'plantas' ? error : listado.error}</p>
            )}

            {pestana === 'clientes' && !cargando && !error && (
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

            {pestana === 'plantas' && !cargando && !error && (
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

            {tipoListado && !listado.cargando && !listado.error && (
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
          </>
        ) : panel.modo === 'nuevoCliente' || panel.modo === 'editarCliente' ? (
          <>
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
        ) : panel.modo === 'homogenizar' ? (
          <HomogenizarPanel
            tipo={tipoListado ?? 'especie'}
            onCerrar={() => setPanel({ modo: 'lista' })}
            onAplicado={listado.refrescar}
          />
        ) : (
          <EstandaresPanel
            tipo={tipoListado ?? 'especie'}
            onCerrar={() => setPanel({ modo: 'lista' })}
            onCambio={listado.refrescar}
          />
        )}
      </Card>
    </div>
  )
}
