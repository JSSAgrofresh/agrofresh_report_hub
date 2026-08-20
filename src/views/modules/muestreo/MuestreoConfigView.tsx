import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  actualizarAnalitoConfig,
  actualizarLineaProceso,
  actualizarTipoAplicacion,
  crearAnalitoConfig,
  crearLineaProceso,
  crearTipoAplicacion,
  eliminarAnalitoConfig,
  eliminarLineaProceso,
  eliminarTipoAplicacion,
  guardarCamposConfig,
  listarAnalitosConfig,
  listarCamposConfig,
  listarLineasProceso,
  listarTiposAplicacion,
} from '@/features/tomaMuestras'
import type { AnalitoConfig, CampoConfig, OpcionConfig } from '@/features/tomaMuestras'
import { AnalitosMantenedor } from './AnalitosMantenedor'
import { OpcionesMantenedor } from './OpcionesMantenedor'
import styles from './MuestreoConfigView.module.css'

type Pestana = 'campos' | 'tiposAplicacion' | 'lineasProceso' | 'analitos'

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'campos', etiqueta: 'Campos generales' },
  { valor: 'tiposAplicacion', etiqueta: 'Tipos de aplicación' },
  { valor: 'lineasProceso', etiqueta: 'Líneas de proceso' },
  { valor: 'analitos', etiqueta: 'Analitos por laboratorio' },
]

export function MuestreoConfigView() {
  const [pestana, setPestana] = useState<Pestana>('campos')

  const [campos, setCampos] = useState<CampoConfig[] | null>(null)
  const [guardandoCampos, setGuardandoCampos] = useState(false)
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  const [lineasProceso, setLineasProceso] = useState<OpcionConfig[]>([])
  const [analitos, setAnalitos] = useState<AnalitoConfig[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarCamposConfig()
      .then(setCampos)
      .catch(() => setError('No se pudo cargar la configuración de campos.'))
    listarTiposAplicacion()
      .then(setTiposAplicacion)
      .catch(() => setError('No se pudo cargar los tipos de aplicación.'))
    listarLineasProceso()
      .then(setLineasProceso)
      .catch(() => setError('No se pudo cargar las líneas de proceso.'))
    listarAnalitosConfig()
      .then(setAnalitos)
      .catch(() => setError('No se pudo cargar los analitos.'))
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

        {pestana === 'analitos' && (
          <AnalitosMantenedor
            analitos={analitos}
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
      </Card>
    </div>
  )
}
