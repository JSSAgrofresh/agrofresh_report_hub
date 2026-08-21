import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { asignarValor, crearEstandar, editarEstandar, eliminarEstandar, listarEstandares } from '../lib/api'
import type { EstandaresResponse, TipoListado } from '../lib/tipos'
import styles from './EstandaresPanel.module.css'

interface EstandaresPanelProps {
  tipo: TipoListado
  onCerrar: () => void
  onCambio: () => void
}

export function EstandaresPanel({ tipo, onCerrar, onCambio }: EstandaresPanelProps) {
  const [datos, setDatos] = useState<EstandaresResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [nombresEditados, setNombresEditados] = useState<Record<number, string>>({})
  const [asignacionElegida, setAsignacionElegida] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState(false)

  async function refrescar() {
    try {
      setDatos(await listarEstandares(tipo))
      setError(null)
    } catch {
      setError('No se pudieron cargar las variedades estándar.')
    }
  }

  useEffect(() => {
    refrescar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  async function crear() {
    if (!nombreNuevo.trim()) return
    setOcupado(true)
    try {
      await crearEstandar(tipo, nombreNuevo.trim())
      setNombreNuevo('')
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo crear la variedad estándar. Puede que ya exista una con ese nombre.')
    } finally {
      setOcupado(false)
    }
  }

  async function guardarNombre(id: number, activo: boolean) {
    const nombre = nombresEditados[id]
    if (!nombre || !nombre.trim()) return
    setOcupado(true)
    try {
      await editarEstandar(tipo, id, { valor: nombre.trim(), activo })
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo renombrar la variedad estándar.')
    } finally {
      setOcupado(false)
    }
  }

  async function alternarActivo(id: number, valor: string, activo: boolean) {
    setOcupado(true)
    try {
      await editarEstandar(tipo, id, { valor, activo: !activo })
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo cambiar el estado de la variedad estándar.')
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar(id: number) {
    if (!window.confirm('¿Eliminar esta variedad estándar? Los valores que tenía asignados quedan sin asignar, no se borran.')) return
    setOcupado(true)
    try {
      await eliminarEstandar(tipo, id)
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo eliminar la variedad estándar.')
    } finally {
      setOcupado(false)
    }
  }

  async function quitarAsignacion(valorId: number) {
    setOcupado(true)
    try {
      await asignarValor(tipo, valorId, null)
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo desasignar el valor.')
    } finally {
      setOcupado(false)
    }
  }

  async function asignar(valorId: number) {
    const estandarId = Number(asignacionElegida[valorId])
    if (!estandarId) return
    setOcupado(true)
    try {
      await asignarValor(tipo, valorId, estandarId)
      await refrescar()
      onCambio()
    } catch {
      setError('No se pudo asignar el valor.')
    } finally {
      setOcupado(false)
    }
  }

  if (!datos && !error) return <p className={styles.estado}>Cargando…</p>

  return (
    <div className={styles.contenedor}>
      <p className={styles.intro}>
        Acá vive la clasificación final: cada variedad estándar y los valores originales que le corresponden. Movés,
        renombrás, creás o eliminás con total libertad -nada de esto borra las solicitudes ya guardadas-.
      </p>
      {error && <p className={styles.estadoError}>{error}</p>}

      <div className={styles.seccion}>
        <p className={styles.tituloSeccion}>Nueva variedad estándar</p>
        <div className={styles.nuevaFila}>
          <input
            value={nombreNuevo}
            placeholder="Ej. Packham's Triumph"
            onChange={(e) => setNombreNuevo(e.target.value)}
          />
          <Button type="button" disabled={ocupado} onClick={crear}>
            Crear
          </Button>
        </div>
      </div>

      {datos && (
        <div className={styles.seccion}>
          <p className={styles.tituloSeccion}>Variedades estándar ({datos.estandares.length})</p>
          {datos.estandares.length === 0 && <p className={styles.vacio}>Todavía no hay ninguna creada.</p>}
          {datos.estandares.map((e) => (
            <div className={styles.tarjeta} key={e.id}>
              <div className={styles.tarjetaCabecera}>
                <input
                  value={nombresEditados[e.id] ?? e.valor}
                  onChange={(ev) => setNombresEditados((actual) => ({ ...actual, [e.id]: ev.target.value }))}
                />
                <Badge tone={e.activo ? 'success' : 'neutral'}>{e.activo ? 'Activo' : 'Inactivo'}</Badge>
                <button className={styles.boton} disabled={ocupado} onClick={() => guardarNombre(e.id, e.activo)}>
                  Guardar nombre
                </button>
                <button className={styles.boton} disabled={ocupado} onClick={() => alternarActivo(e.id, e.valor, e.activo)}>
                  {e.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button className={styles.botonPeligro} disabled={ocupado} onClick={() => eliminar(e.id)}>
                  Eliminar
                </button>
              </div>
              <div className={styles.chips}>
                {e.valores_asignados.length === 0 && <span className={styles.vacio}>Sin valores asignados.</span>}
                {e.valores_asignados.map((v) => (
                  <span className={styles.chip} key={v.id}>
                    {v.valor}
                    <button type="button" disabled={ocupado} title="Quitar de esta variedad" onClick={() => quitarAsignacion(v.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {datos && (
        <div className={styles.seccion}>
          <p className={styles.tituloSeccion}>Valores sin asignar ({datos.sin_asignar.length})</p>
          {datos.sin_asignar.length === 0 && <p className={styles.vacio}>No hay valores pendientes de asignar.</p>}
          {datos.sin_asignar.map((v) => (
            <div className={styles.filaAsignar} key={v.id}>
              <span>{v.valor}</span>
              <select
                value={asignacionElegida[v.id] ?? ''}
                onChange={(e) => setAsignacionElegida((actual) => ({ ...actual, [v.id]: e.target.value }))}
              >
                <option value="">— elegir variedad estándar —</option>
                {datos.estandares.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.valor}
                  </option>
                ))}
              </select>
              <button className={styles.boton} disabled={ocupado || !asignacionElegida[v.id]} onClick={() => asignar(v.id)}>
                Asignar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.acciones}>
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Volver
        </Button>
      </div>
    </div>
  )
}
