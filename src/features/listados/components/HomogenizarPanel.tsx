import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { asignarValor, candidatosHomogenizacion, crearEstandar } from '../lib/api'
import type { GrupoHomogenizacion, TipoListado } from '../lib/tipos'
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidatosHomogenizacion(tipo)
      .then((datos) =>
        setGrupos(
          datos.map((grupo) => ({
            grupo,
            asignados: new Set(),
            buckets: [nuevoBucket(grupo.valor_propuesto)],
          })),
        ),
      )
      .catch(() => setError('No se pudieron calcular los grupos candidatos.'))
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
      onAplicado()
    } catch {
      actualizarBucket(indiceGrupo, indiceBucket, { creando: false, error: 'No se pudo crear/asignar la variedad.' })
    }
  }

  return (
    <div className={styles.contenedor}>
      <p className={styles.intro}>
        Estos son grupos de valores parecidos -pueden contener MÁS DE UNA variedad real con nombres similares-. Vos
        decidís: arma una o varias variedades estándar por grupo, poniéndole nombre y marcando qué valores le
        corresponden a cada una. Los valores que dejes sin marcar quedan como están, sin tocarlos.
      </p>

      {error && <p className={styles.estadoError}>{error}</p>}
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

      <div className={styles.acciones}>
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Volver
        </Button>
      </div>
    </div>
  )
}
