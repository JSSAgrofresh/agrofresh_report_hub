import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  actualizarAnalitoConfig,
  actualizarCampoTipoAplicacion,
  actualizarCategoriaAnalitica,
  actualizarLaboratorioConfig,
  actualizarLineaProceso,
  actualizarProductoConfig,
  actualizarTipoAplicacion,
  crearAnalitoConfig,
  crearCampoTipoAplicacion,
  crearCategoriaAnalitica,
  crearLaboratorioConfig,
  crearLineaProceso,
  crearProductoConfig,
  crearTipoAplicacion,
  eliminarAnalitoConfig,
  eliminarCampoTipoAplicacion,
  eliminarCategoriaAnalitica,
  eliminarLaboratorioConfig,
  eliminarLineaProceso,
  eliminarProductoConfig,
  eliminarTipoAplicacion,
  guardarCamposConfig,
  listarAnalitosConfig,
  listarCamposConfig,
  listarCamposTipoAplicacion,
  listarCategoriasAnaliticas,
  listarLaboratoriosConfig,
  listarLineasProceso,
  listarProductosConfig,
  listarTiposAplicacion,
} from '@/features/tomaMuestras'
import type {
  AnalitoConfig,
  CampoConfig,
  CampoTipoAplicacionConfig,
  CategoriaAnaliticaConfig,
  LaboratorioConfig,
  OpcionConfig,
  ProductoConfig,
} from '@/features/tomaMuestras'
import { AnalitosMantenedor } from './AnalitosMantenedor'
import { CamposTipoAplicacionMantenedor } from './CamposTipoAplicacionMantenedor'
import { CategoriasAnaliticasMantenedor } from './CategoriasAnaliticasMantenedor'
import { LaboratoriosMantenedor } from './LaboratoriosMantenedor'
import { OpcionesMantenedor } from './OpcionesMantenedor'
import { ProductosMantenedor } from './ProductosMantenedor'
import styles from './MuestreoConfigView.module.css'

type Pestana =
  | 'campos'
  | 'laboratorios'
  | 'tiposAplicacion'
  | 'camposTipoAplicacion'
  | 'lineasProceso'
  | 'categoriasAnaliticas'
  | 'analitos'
  | 'productos'

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'campos', etiqueta: 'Campos generales' },
  { valor: 'laboratorios', etiqueta: 'Laboratorios' },
  { valor: 'tiposAplicacion', etiqueta: 'Tipos de aplicación' },
  { valor: 'camposTipoAplicacion', etiqueta: 'Campos por tipo de aplicación' },
  { valor: 'lineasProceso', etiqueta: 'Líneas de proceso' },
  { valor: 'categoriasAnaliticas', etiqueta: 'Categorías analíticas' },
  { valor: 'analitos', etiqueta: 'Analitos por laboratorio' },
  { valor: 'productos', etiqueta: 'Productos' },
]

export function MuestreoConfigView() {
  const [pestana, setPestana] = useState<Pestana>('campos')

  const [campos, setCampos] = useState<CampoConfig[] | null>(null)
  const [guardandoCampos, setGuardandoCampos] = useState(false)
  const [laboratorios, setLaboratorios] = useState<LaboratorioConfig[]>([])
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  const [lineasProceso, setLineasProceso] = useState<OpcionConfig[]>([])
  const [categoriasAnaliticas, setCategoriasAnaliticas] = useState<CategoriaAnaliticaConfig[]>([])
  const [analitos, setAnalitos] = useState<AnalitoConfig[]>([])
  const [productos, setProductos] = useState<ProductoConfig[]>([])
  const [camposTipoAplicacion, setCamposTipoAplicacion] = useState<CampoTipoAplicacionConfig[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarCamposConfig()
      .then(setCampos)
      .catch(() => setError('No se pudo cargar la configuración de campos.'))
    listarLaboratoriosConfig()
      .then(setLaboratorios)
      .catch(() => setError('No se pudo cargar los laboratorios.'))
    listarTiposAplicacion()
      .then(setTiposAplicacion)
      .catch(() => setError('No se pudo cargar los tipos de aplicación.'))
    listarLineasProceso()
      .then(setLineasProceso)
      .catch(() => setError('No se pudo cargar las líneas de proceso.'))
    listarCategoriasAnaliticas()
      .then(setCategoriasAnaliticas)
      .catch(() => setError('No se pudo cargar las categorías analíticas.'))
    listarAnalitosConfig()
      .then(setAnalitos)
      .catch(() => setError('No se pudo cargar los analitos.'))
    listarProductosConfig()
      .then(setProductos)
      .catch(() => setError('No se pudo cargar los productos.'))
    listarCamposTipoAplicacion()
      .then(setCamposTipoAplicacion)
      .catch(() => setError('No se pudo cargar los campos por tipo de aplicación.'))
  }, [])

  function actualizarCampoLocal(clave: string, cambios: Partial<CampoConfig>) {
    setCampos((actual) => actual && actual.map((c) => (c.clave === clave ? { ...c, ...cambios } : c)))
  }

  async function guardarCampos() {
    if (!campos) return
    setGuardandoCampos(true)
    setError(null)
    try {
      await guardarCamposConfig(campos)
    } catch {
      setError('No se pudo guardar la configuración de campos.')
    } finally {
      setGuardandoCampos(false)
    }
  }

  return (
    <div>
      <Header
        title="Configuración de Toma de muestras"
        description="Define qué campos son requeridos y mantiene las listas de tipos de aplicación, líneas de proceso y analitos por laboratorio."
      />

      <div className={styles.tabs}>
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={cn(styles.tab, pestana === p.valor && styles.tabActiva)}
            onClick={() => setPestana(p.valor)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <Card>
        {error && <p className={styles.error}>{error}</p>}

        {pestana === 'campos' &&
          (campos === null ? (
            <p className={styles.estado}>Cargando…</p>
          ) : (
            <>
              <div className={styles.tablaCaja}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Etiqueta</th>
                      <th>Tipo</th>
                      <th>Requerido</th>
                      <th>Activo</th>
                      <th>Orden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campos
                      .slice()
                      .sort((a, b) => a.orden - b.orden)
                      .map((c) => (
                        <tr key={c.clave}>
                          <td className={styles.claveMono}>{c.clave}</td>
                          <td>
                            <input
                              className={styles.inputCelda}
                              value={c.etiqueta}
                              onChange={(e) => actualizarCampoLocal(c.clave, { etiqueta: e.target.value })}
                            />
                          </td>
                          <td className={styles.tipoMono}>{c.tipo}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={c.requerido}
                              onChange={(e) => actualizarCampoLocal(c.clave, { requerido: e.target.checked })}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={c.activo}
                              onChange={(e) => actualizarCampoLocal(c.clave, { activo: e.target.checked })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className={styles.inputCeldaChico}
                              value={c.orden}
                              onChange={(e) => actualizarCampoLocal(c.clave, { orden: Number(e.target.value) })}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pieGuardar}>
                <Button onClick={guardarCampos} disabled={guardandoCampos}>
                  {guardandoCampos ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </>
          ))}

        {pestana === 'laboratorios' && (
          <LaboratoriosMantenedor
            laboratorios={laboratorios}
            onCrear={async (d) => setLaboratorios(await crearLaboratorioConfig(d).then((n) => [...laboratorios, n]))}
            onEditar={async (id, d) =>
              setLaboratorios(
                await actualizarLaboratorioConfig(id, d).then((n) => laboratorios.map((l) => (l.id === id ? n : l))),
              )
            }
            onEliminar={async (id) => {
              await eliminarLaboratorioConfig(id)
              setLaboratorios(laboratorios.filter((l) => l.id !== id))
            }}
          />
        )}

        {pestana === 'tiposAplicacion' && (
          <OpcionesMantenedor
            opciones={tiposAplicacion}
            onCrear={async (d) => setTiposAplicacion(await crearTipoAplicacion(d).then((n) => [...tiposAplicacion, n]))}
            onEditar={async (id, d) =>
              setTiposAplicacion(
                await actualizarTipoAplicacion(id, d).then((n) => tiposAplicacion.map((o) => (o.id === id ? n : o))),
              )
            }
            onEliminar={async (id) => {
              await eliminarTipoAplicacion(id)
              setTiposAplicacion(tiposAplicacion.filter((o) => o.id !== id))
            }}
          />
        )}

        {pestana === 'camposTipoAplicacion' && (
          <CamposTipoAplicacionMantenedor
            campos={camposTipoAplicacion}
            tiposAplicacion={tiposAplicacion}
            onCrear={async (d) =>
              setCamposTipoAplicacion(await crearCampoTipoAplicacion(d).then((n) => [...camposTipoAplicacion, n]))
            }
            onEditar={async (id, d) =>
              setCamposTipoAplicacion(
                await actualizarCampoTipoAplicacion(id, d).then((n) =>
                  camposTipoAplicacion.map((c) => (c.id === id ? n : c)),
                ),
              )
            }
            onEliminar={async (id) => {
              await eliminarCampoTipoAplicacion(id)
              setCamposTipoAplicacion(camposTipoAplicacion.filter((c) => c.id !== id))
            }}
          />
        )}

        {pestana === 'lineasProceso' && (
          <OpcionesMantenedor
            opciones={lineasProceso}
            onCrear={async (d) => setLineasProceso(await crearLineaProceso(d).then((n) => [...lineasProceso, n]))}
            onEditar={async (id, d) =>
              setLineasProceso(
                await actualizarLineaProceso(id, d).then((n) => lineasProceso.map((o) => (o.id === id ? n : o))),
              )
            }
            onEliminar={async (id) => {
              await eliminarLineaProceso(id)
              setLineasProceso(lineasProceso.filter((o) => o.id !== id))
            }}
          />
        )}

        {pestana === 'categoriasAnaliticas' && (
          <CategoriasAnaliticasMantenedor
            categorias={categoriasAnaliticas}
            onCrear={async (d) =>
              setCategoriasAnaliticas(await crearCategoriaAnalitica(d).then((n) => [...categoriasAnaliticas, n]))
            }
            onEditar={async (id, d) =>
              setCategoriasAnaliticas(
                await actualizarCategoriaAnalitica(id, d).then((n) =>
                  categoriasAnaliticas.map((c) => (c.id === id ? n : c)),
                ),
              )
            }
            onEliminar={async (id) => {
              await eliminarCategoriaAnalitica(id)
              setCategoriasAnaliticas(categoriasAnaliticas.filter((c) => c.id !== id))
            }}
          />
        )}

        {pestana === 'analitos' && (
          <AnalitosMantenedor
            analitos={analitos}
            categorias={categoriasAnaliticas}
            tiposAplicacion={tiposAplicacion}
            onCrear={async (d) => setAnalitos(await crearAnalitoConfig(d).then((n) => [...analitos, n]))}
            onEditar={async (id, d) =>
              setAnalitos(await actualizarAnalitoConfig(id, d).then((n) => analitos.map((a) => (a.id === id ? n : a))))
            }
            onEliminar={async (id) => {
              await eliminarAnalitoConfig(id)
              setAnalitos(analitos.filter((a) => a.id !== id))
            }}
          />
        )}

        {pestana === 'productos' && (
          <ProductosMantenedor
            productos={productos}
            tiposAplicacion={tiposAplicacion}
            onCrear={async (d) => setProductos(await crearProductoConfig(d).then((n) => [...productos, n]))}
            onEditar={async (id, d) =>
              setProductos(await actualizarProductoConfig(id, d).then((n) => productos.map((p) => (p.id === id ? n : p))))
            }
            onEliminar={async (id) => {
              await eliminarProductoConfig(id)
              setProductos(productos.filter((p) => p.id !== id))
            }}
          />
        )}
      </Card>
    </div>
  )
}
