import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  asignarValor,
  candidatosHomogenizacion,
  crearEstandar,
  editarEstandar,
  eliminarEstandar,
  listarEstandares,
} from '../lib/api'
import type { EstandaresResponse, GrupoHomogenizacion, TipoListado } from '../lib/tipos'
import styles from './HomogenizarPanel.module.css'

interface Bucket {
  nombre: string
  seleccionados: Set<number>
  creando: boolean
  error: string | null
  creado: boolean
}

interface EstadoGrupo {
  grupo: GrupoHomogenizacion
  /** ids ya asignados a alguna variedad desde este panel -se van sacando de
   * la lista de miembros disponibles a medida que el admin crea variedades-. */
  asignados: Set<number>
  buckets: Bucket[]
}

interface HomogenizarPanelProps {
  tipo: TipoListado
  onCerrar: () => void
  onAplicado: () => void
}

function nuevoBucket(nombreSugerido: string): Bucket {
  return { nombre: nombreSugerido, seleccionados: new Set(), creando: false, error: null, creado: false }
}

export function HomogenizarPanel({ tipo, onCerrar, onAplicado }: HomogenizarPanelProps) {
  const [grupos, setGrupos] = useState<EstadoGrupo[] | null>(null)
  const [estandares, setEstandares] = useState<EstandaresResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [nombresEditados, setNombresEditados] = useState<Record<number, string>>({})
  const [asignacionElegida, setAsignacionElegida] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState(false)

  async function cargarEstandares() {
    try {
      setEstandares(await listarEstandares(tipo))
    } catch {
      setError('No se pudo cargar la lista de variedades estándar.')
    }
  }

  useEffect(() => {
    candidatosHomogenizacion(tipo)
      .then((candidatos) =>
        setGrupos(
          candidatos.map((grupo) => ({
            grupo,
            asignados: new Set<number>(),
            buckets: [nuevoBucket(grupo.valor_propuesto)],
          })),
        ),
      )
      .catch(() => setError('No se pudieron calcular los grupos candidatos.'))
    cargarEstandares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  function actualizarGrupo(indice: number, cambios: Partial<EstadoGrupo>) {
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      copia[indice] = { ...copia[indice], ...cambios }
      return copia
    })
  }

  function actualizarBucket(indiceGrupo: number, indiceBucket: number, cambios: Partial<Bucket>) {
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      const buckets = [...copia[indiceGrupo].buckets]
      buckets[indiceBucket] = { ...buckets[indiceBucket], ...cambios }
      copia[indiceGrupo] = { ...copia[indiceGrupo], buckets }
      return copia
    })
  }

  function alternarMiembro(indiceGrupo: number, indiceBucket: number, id: number) {
    const bucket = grupos![indiceGrupo].buckets[indiceBucket]
    const seleccionados = new Set(bucket.seleccionados)
    if (seleccionados.has(id)) seleccionados.delete(id)
    else seleccionados.add(id)
    actualizarBucket(indiceGrupo, indiceBucket, { seleccionados })
  }

  function agregarBucket(indiceGrupo: number) {
    setGrupos((actual) => {
      if (!actual) return actual
      const copia = [...actual]
      copia[indiceGrupo] = { ...copia[indiceGrupo], buckets: [...copia[indiceGrupo].buckets, nuevoBucket('')] }
      return copia
    })
  }

  async function crearYAsignar(indiceGrupo: number, indiceBucket: number) {
    const estadoGrupo = grupos![indiceGrupo]
    const bucket = estadoGrupo.buckets[indiceBucket]
    const ids = [...bucket.seleccionados]
    if (!bucket.nombre.trim()) {
      actualizarBucket(indiceGrupo, indiceBucket, { error: 'Ponle un nombre a la variedad estándar.' })
      return
    }
    if (ids.length === 0) {
      actualizarBucket(indiceGrupo, indiceBucket, { error: 'Selecciona al menos un valor para asignar.' })
      return
    }
    actualizarBucket(indiceGrupo, indiceBucket, { creando: true, error: null })
    try {
      const { id: estandarId } = await crearEstandar(tipo, bucket.nombre.trim())
      await Promise.all(ids.map((id) => asignarValor(tipo, id, estandarId)))
      actualizarBucket(indiceGrupo, indiceBucket, { creando: false, creado: true })
      actualizarGrupo(indiceGrupo, { asignados: new Set([...estadoGrupo.asignados, ...ids]) })
      await cargarEstandares()
      onAplicado()
    } catch {
      actualizarBucket(indiceGrupo, indiceBucket, { creando: false, error: 'No se pudo crear/asignar la variedad.' })
    }
  }

  async function crearVariedadSuelta() {
    if (!nombreNuevo.trim()) return
    setOcupado(true)
    try {
      await crearEstandar(tipo, nombreNuevo.trim())
      setNombreNuevo('')
      await cargarEstandares()
      onAplicado()
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
      await cargarEstandares()
      onAplicado()
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
      await cargarEstandares()
      onAplicado()
    } catch {
      setError('No se pudo cambiar el estado de la variedad estándar.')
    } finally {
      setOcupado(false)
    }
  }

  async function eliminarVariedad(id: number) {
    if (!window.confirm('¿Eliminar esta variedad estándar? Los valores que tenía asignados quedan sin asignar, no se borran.')) return
    setOcupado(true)
    try {
      await eliminarEstandar(tipo, id)
      await cargarEstandares()
      onAplicado()
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
      await cargarEstandares()
      onAplicado()
    } catch {
      setError('No se pudo desasignar el valor.')
    } finally {
      setOcupado(false)
    }
  }

  async function asignarSuelto(valorId: number) {
    const estandarId = Number(asignacionElegida[valorId])
    if (!estandarId) return
    setOcupado(true)
    try {
      await asignarValor(tipo, valorId, estandarId)
      await cargarEstandares()
      onAplicado()
    } catch {
      setError('No se pudo asignar el valor.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={styles.contenedor}>
      <p className={styles.intro}>
        Acá vive todo: los grupos de valores parecidos son solo una ayuda de revisión -pueden contener MÁS DE UNA
        variedad real con nombres similares-, así que vos decidís cuántas variedades estándar armás de cada grupo y
        qué valores le corresponden a cada una. Lo ya asignado también se puede corregir acá mismo: renombrar, quitar
        un valor mal puesto o eliminar la variedad.
      </p>

      {error && <p className={styles.estadoError}>{error}</p>}

      {/* Variedades ya creadas: editables por si algo quedó mal asignado. */}
      <div className={styles.seccionEstandares}>
        <p className={styles.tituloSeccion}>Variedades estándar creadas {estandares ? `(${estandares.estandares.length})` : ''}</p>

        <div className={styles.nuevaFila}>
          <input
            value={nombreNuevo}
            placeholder="Crear variedad suelta, ej. Packham's Triumph"
            onChange={(e) => setNombreNuevo(e.target.value)}
          />
          <Button type="button" disabled={ocupado} onClick={crearVariedadSuelta}>
            Crear
          </Button>
        </div>

        {estandares?.estandares.length === 0 && <p className={styles.vacio}>Todavía no hay ninguna creada.</p>}
        {estandares?.estandares.map((e) => (
          <div className={styles.tarjetaEstandar} key={e.id}>
            <div className={styles.tarjetaCabecera}>
              <input
                value={nombresEditados[e.id] ?? e.valor}
                onChange={(ev) => setNombresEditados((actual) => ({ ...actual, [e.id]: ev.target.value }))}
              />
              <Badge tone={e.activo ? 'success' : 'neutral'}>{e.activo ? 'Activo' : 'Inactivo'}</Badge>
              <button className={styles.botonChico} disabled={ocupado} onClick={() => guardarNombre(e.id, e.activo)}>
                Guardar nombre
              </button>
              <button className={styles.botonChico} disabled={ocupado} onClick={() => alternarActivo(e.id, e.valor, e.activo)}>
                {e.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button className={styles.botonChicoPeligro} disabled={ocupado} onClick={() => eliminarVariedad(e.id)}>
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

      {/* Grupos candidatos: solo sugerencia, nada se fusiona sin confirmar. */}
      <div className={styles.seccionEstandares}>
        <p className={styles.tituloSeccion}>Grupos candidatos a revisar</p>

        {grupos === null && !error && <p className={styles.estado}>Calculando grupos candidatos…</p>}
        {grupos !== null && grupos.length === 0 && (
          <p className={styles.vacio}>No se encontraron valores candidatos a revisar.</p>
        )}

        {grupos?.map((estadoGrupo, indiceGrupo) => {
          const disponibles = estadoGrupo.grupo.valores.filter((v) => !estadoGrupo.asignados.has(v.id))
          return (
            <div className={styles.grupo} key={indiceGrupo}>
              <div className={styles.grupoCabecera}>
                <Badge tone={estadoGrupo.grupo.confianza === 'alta' ? 'success' : 'warning'}>
                  {estadoGrupo.grupo.confianza === 'alta' ? 'Alta confianza' : 'A revisar'}
                </Badge>
                <span className={styles.contadorGrupo}>{estadoGrupo.grupo.valores.length} valores parecidos</span>
              </div>

              {disponibles.length === 0 ? (
                <p className={styles.aplicado}>Todos los valores de este grupo ya fueron asignados ✓</p>
              ) : (
                <p className={styles.miembrosDisponibles}>
                  Valores sin asignar de este grupo: {disponibles.map((v) => v.valor).join(', ')}
                </p>
              )}

              {estadoGrupo.buckets.map((bucket, indiceBucket) => {
                const seleccionablesRestantes = disponibles.filter(
                  (v) =>
                    bucket.seleccionados.has(v.id) ||
                    !estadoGrupo.buckets.some((b, i) => i !== indiceBucket && b.seleccionados.has(v.id)),
                )
                if (bucket.creado) return null
                return (
                  <div className={styles.bucket} key={indiceBucket}>
                    <div className={styles.propuesto}>
                      <span>Variedad estándar</span>
                      <input
                        value={bucket.nombre}
                        placeholder="Ej. Packham"
                        onChange={(e) => actualizarBucket(indiceGrupo, indiceBucket, { nombre: e.target.value })}
                      />
                    </div>
                    <div className={styles.miembros}>
                      {seleccionablesRestantes.map((v) => (
                        <label className={styles.miembro} key={v.id}>
                          <input
                            type="checkbox"
                            checked={bucket.seleccionados.has(v.id)}
                            onChange={() => alternarMiembro(indiceGrupo, indiceBucket, v.id)}
                          />
                          {v.valor}
                        </label>
                      ))}
                    </div>
                    {bucket.error && <p className={styles.estadoError}>{bucket.error}</p>}
                    <div className={styles.acciones}>
                      <Button type="button" disabled={bucket.creando} onClick={() => crearYAsignar(indiceGrupo, indiceBucket)}>
                        {bucket.creando ? 'Creando…' : 'Crear variedad y asignar seleccionados'}
                      </Button>
                    </div>
                  </div>
                )
              })}

              {disponibles.length > 0 && (
                <button type="button" className={styles.botonAgregarBucket} onClick={() => agregarBucket(indiceGrupo)}>
                  + Otra variedad estándar desde este grupo
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Valores sin asignar que no cayeron en ningún grupo detectado. */}
      {estandares && estandares.sin_asignar.length > 0 && (
        <div className={styles.seccionEstandares}>
          <p className={styles.tituloSeccion}>Otros valores sin asignar ({estandares.sin_asignar.length})</p>
          {estandares.sin_asignar.map((v) => (
            <div className={styles.filaAsignar} key={v.id}>
              <span>{v.valor}</span>
              <select
                value={asignacionElegida[v.id] ?? ''}
                onChange={(e) => setAsignacionElegida((actual) => ({ ...actual, [v.id]: e.target.value }))}
              >
                <option value="">— elegir variedad estándar —</option>
                {estandares.estandares.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.valor}
                  </option>
                ))}
              </select>
              <button className={styles.botonChico} disabled={ocupado || !asignacionElegida[v.id]} onClick={() => asignarSuelto(v.id)}>
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
