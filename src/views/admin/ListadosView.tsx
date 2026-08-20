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
import styles from './ListadosView.module.css'

type Pestana = 'clientes' | 'plantas'
type Panel =
  | { modo: 'lista' }
  | { modo: 'nuevoCliente' }
  | { modo: 'editarCliente'; cliente: Cliente }
  | { modo: 'nuevaPlanta'; clientePreseleccionado?: Cliente }
  | { modo: 'editarPlanta'; planta: Planta }

export function ListadosView() {
  const { clientes, plantas, cargando, error, crearCliente, editarCliente, crearPlanta, editarPlanta } =
    useCatalogo()
  const [pestana, setPestana] = useState<Pestana>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

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

  const TOPE = 200
  const clientesVisibles = clientesFiltrados.slice(0, TOPE)
  const plantasVisibles = plantasFiltradas.slice(0, TOPE)

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

  return (
    <div>
      <Header
        title="Listados"
        description="Catálogo oficial de Sold To y Ship To. Ingest y Converter homogenizan contra estos nombres antes de cargar datos nuevos."
      />

      <Card>
        {panel.modo === 'lista' ? (
          <>
            <div className={styles.tabs}>
              <button
                type="button"
                className={cn(styles.tab, pestana === 'clientes' && styles.tabActiva)}
                onClick={() => setPestana('clientes')}
              >
                Sold To ({clientes.length})
              </button>
              <button
                type="button"
                className={cn(styles.tab, pestana === 'plantas' && styles.tabActiva)}
                onClick={() => setPestana('plantas')}
              >
                Ship To ({plantas.length})
              </button>
            </div>

            <div className={styles.cabeceraTabla}>
              <input
                className={styles.busqueda}
                placeholder={pestana === 'clientes' ? 'Buscar por nombre, N° Sold To o RUT…' : 'Buscar por nombre, cliente, N° Ship To o ciudad…'}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <Button
                onClick={() =>
                  setPanel(pestana === 'clientes' ? { modo: 'nuevoCliente' } : { modo: 'nuevaPlanta' })
                }
              >
                {pestana === 'clientes' ? 'Nuevo Sold To' : 'Nuevo Ship To'}
              </Button>
            </div>

            {cargando && <p className={styles.estado}>Cargando catálogo…</p>}
            {error && <p className={styles.estadoError}>{error}</p>}

            {!cargando && !error && (
              <>
                {(pestana === 'clientes' ? clientesFiltrados : plantasFiltradas).length > TOPE && (
                  <p className={styles.notaTope}>
                    Mostrando los primeros {TOPE} resultados de{' '}
                    {(pestana === 'clientes' ? clientesFiltrados : plantasFiltradas).length}. Afina la búsqueda para
                    ver otros.
                  </p>
                )}
                {pestana === 'clientes' ? (
                  <ClientesTable
                    clientes={clientesVisibles}
                    onEditar={(cliente) => setPanel({ modo: 'editarCliente', cliente })}
                    onNuevaSucursal={(cliente) => setPanel({ modo: 'nuevaPlanta', clientePreseleccionado: cliente })}
                  />
                ) : (
                  <PlantasTable
                    plantas={plantasVisibles}
                    onEditar={(planta) => setPanel({ modo: 'editarPlanta', planta })}
                  />
                )}
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
        ) : (
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
        )}
      </Card>
    </div>
  )
}
