import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDecimalCL, parseDecimalCL } from '@/lib/locale'
import {
  crearAnalito,
  actualizarAnalito,
  eliminarAnalito,
  listarLimites,
  guardarLimite,
  eliminarLimite,
} from '@/features/reportes'
import type { Analito, AnalitoInput, LimiteAnalito, LimiteAnalitoInput } from '@/features/reportes'
import styles from './AnalitosAdminModal.module.css'

type Panel = { modo: 'lista' } | { modo: 'nuevo' } | { modo: 'editar'; analito: Analito } | { modo: 'limites'; analito: Analito }

interface Props {
  analitos: Analito[]
  onCambio: (analitos: Analito[]) => void
  onCerrar: () => void
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : parseDecimalCL(s)
}

function fmtLimite(v: number | string | null): string {
  return v != null ? formatDecimalCL(Number(v), 4) : '—'
}

/** especie/tipo_servicio vacíos son el comodín "aplica a todo". */
function etiqueta(v: string): string {
  return v.trim() === '' ? 'Todas / todos' : v
}

function AnalitoForm({
  analito,
  onGuardado,
  onCancelar,
}: {
  analito?: Analito
  onGuardado: (a: Analito) => void
  onCancelar: () => void
}) {
  const [codigo, setCodigo] = useState(analito?.codigo ?? '')
  const [nombre, setNombre] = useState(analito?.nombre ?? '')
  const [categoria, setCategoria] = useState(analito?.categoria ?? '')
  const [laboratorio, setLaboratorio] = useState(analito?.laboratorio ?? '')
  const [unidad, setUnidad] = useState(analito?.unidad ?? 'ppm')
  const [matriz, setMatriz] = useState(analito?.matriz ?? '')
  const [limiteDeteccion, setLimiteDeteccion] = useState(analito?.limite_deteccion ?? '')
  const [limiteCuantificacion, setLimiteCuantificacion] = useState(analito?.limite_cuantificacion ?? '')
  const [activo, setActivo] = useState(analito?.activo ?? true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const datos: AnalitoInput = {
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      categoria: categoria.trim(),
      laboratorio: laboratorio.trim(),
      unidad: unidad.trim(),
      matriz: matriz.trim() || null,
      limite_deteccion: limiteDeteccion.trim() || null,
      limite_cuantificacion: limiteCuantificacion.trim() || null,
      activo,
    }
    setGuardando(true)
    try {
      const resultado = analito ? await actualizarAnalito(analito.id, datos) : await crearAnalito(datos)
      onGuardado(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el analito.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>Código</span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="FDL" required />
        </label>
        <label className={styles.campo}>
          <span>Unidad</span>
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="ppm" required />
        </label>
      </div>
      <label className={styles.campo}>
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Fludioxonil" required />
      </label>
      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>Categoría</span>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Residuos de Fungicidas" required />
        </label>
        <label className={styles.campo}>
          <span>Laboratorio</span>
          <input value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} placeholder="Quiteca / AgroFresh" required />
        </label>
      </div>
      <label className={styles.campo}>
        <span>Matriz</span>
        <input value={matriz} onChange={(e) => setMatriz(e.target.value)} placeholder="Fruta/Pulpa" />
      </label>
      <div className={styles.fila}>
        <label className={styles.campo}>
          <span>Límite de detección (LD)</span>
          <input value={limiteDeteccion} onChange={(e) => setLimiteDeteccion(e.target.value)} placeholder="0,005 mg/kg" />
        </label>
        <label className={styles.campo}>
          <span>Límite de cuantificación (LC)</span>
          <input value={limiteCuantificacion} onChange={(e) => setLimiteCuantificacion(e.target.value)} placeholder="0,010 mg/kg" />
        </label>
      </div>

      <p className={styles.subtitulo}>
        Los límites de cumplimiento (mín/máx por especie y tipo de servicio) se configuran aparte, desde el botón
        "Límites" de cada analito en la lista.
      </p>

      <label className={styles.checkbox}>
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span>Activo (aparece disponible para cargar y reportar)</span>
      </label>

      {error && <p className={styles.error}>⚠ {error}</p>}

      <div className={styles.acciones}>
        <Button type="button" variant="secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

function LimiteForm({
  analitoId,
  limite,
  onGuardado,
  onCancelar,
}: {
  analitoId: number
  limite?: LimiteAnalito
  onGuardado: (l: LimiteAnalito) => void
  onCancelar: () => void
}) {
  const [especie, setEspecie] = useState(limite?.especie ?? '')
  const [tipoServicio, setTipoServicio] = useState(limite?.tipo_servicio ?? '')
  const [limiteMin, setLimiteMin] = useState(limite?.limite_min != null ? formatDecimalCL(Number(limite.limite_min), 4) : '')
  const [limiteCentral, setLimiteCentral] = useState(
    limite?.limite_central != null ? formatDecimalCL(Number(limite.limite_central), 4) : '',
  )
  const [limiteMax, setLimiteMax] = useState(limite?.limite_max != null ? formatDecimalCL(Number(limite.limite_max), 4) : '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const datos: LimiteAnalitoInput = {
      analito_id: analitoId,
      especie: especie.trim(),
      tipo_servicio: tipoServicio.trim(),
      limite_min: numOrNull(limiteMin),
      limite_central: numOrNull(limiteCentral),
      limite_max: numOrNull(limiteMax),
    }
    setGuardando(true)
    try {
      onGuardado(await guardarLimite(datos))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el límite.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className={styles.formLimite} onSubmit={(e) => void onSubmit(e)}>
      <div className={styles.filaLimite}>
        <label className={styles.campo}>
          <span>Especie</span>
          <input value={especie} onChange={(e) => setEspecie(e.target.value)} placeholder="(todas)" />
        </label>
        <label className={styles.campo}>
          <span>Tipo de servicio</span>
          <input value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} placeholder="(todos)" />
        </label>
        <label className={styles.campo}>
          <span>Mínimo</span>
          <input value={limiteMin} onChange={(e) => setLimiteMin(e.target.value)} placeholder="0,7" />
        </label>
        <label className={styles.campo}>
          <span>Central</span>
          <input value={limiteCentral} onChange={(e) => setLimiteCentral(e.target.value)} placeholder="—" />
        </label>
        <label className={styles.campo}>
          <span>Máximo</span>
          <input value={limiteMax} onChange={(e) => setLimiteMax(e.target.value)} placeholder="3" />
        </label>
        <div className={styles.accionesLimite}>
          <Button type="button" variant="secondary" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : limite ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </div>
      {error && <p className={styles.error}>⚠ {error}</p>}
    </form>
  )
}

function LimitesPanel({
  analito,
  limites,
  onCambio,
  onVolver,
}: {
  analito: Analito
  limites: LimiteAnalito[]
  onCambio: (limites: LimiteAnalito[]) => void
  onVolver: () => void
}) {
  const [editando, setEditando] = useState<LimiteAnalito | 'nuevo' | null>(null)
  const [borrando, setBorrando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onGuardado(l: LimiteAnalito) {
    const existe = limites.some((x) => x.id === l.id)
    onCambio(existe ? limites.map((x) => (x.id === l.id ? l : x)) : [...limites, l])
    setEditando(null)
  }

  async function onEliminar(l: LimiteAnalito) {
    if (!confirm(`¿Eliminar el límite de ${etiqueta(l.especie)} / ${etiqueta(l.tipo_servicio)}?`)) return
    setError(null)
    setBorrando(l.id)
    try {
      await eliminarLimite(l.id)
      onCambio(limites.filter((x) => x.id !== l.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el límite.')
    } finally {
      setBorrando(null)
    }
  }

  const ordenados = [...limites].sort((a, b) => a.tipo_servicio.localeCompare(b.tipo_servicio) || a.especie.localeCompare(b.especie))

  return (
    <div className={styles.panelLimites}>
      <button className={styles.volver} onClick={onVolver}>
        ← Volver al catálogo
      </button>
      <div className={styles.cabeceraTabla}>
        <div>
          <h4 className={styles.tituloLimites}>
            Límites de <span className={styles.codigo}>{analito.codigo}</span> por especie y tipo de servicio
          </h4>
          <p className={styles.contador}>
            {limites.length} combinación(es) configurada(s). Deja Especie o Tipo de servicio en blanco para que ese
            límite aplique a todas/todos.
          </p>
        </div>
        {editando === null && <Button onClick={() => setEditando('nuevo')}>+ Agregar límite</Button>}
      </div>

      {error && <p className={styles.error}>⚠ {error}</p>}

      {editando !== null && (
        <LimiteForm
          analitoId={analito.id}
          limite={editando === 'nuevo' ? undefined : editando}
          onGuardado={onGuardado}
          onCancelar={() => setEditando(null)}
        />
      )}

      <div className={styles.tablaScroll}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Especie</th>
              <th>Tipo de servicio</th>
              <th>Mínimo</th>
              <th>Central</th>
              <th>Máximo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.faint}>
                  Sin límites configurados todavía.
                </td>
              </tr>
            ) : (
              ordenados.map((l) => (
                <tr key={l.id}>
                  <td>{etiqueta(l.especie)}</td>
                  <td>{etiqueta(l.tipo_servicio)}</td>
                  <td>{fmtLimite(l.limite_min)}</td>
                  <td>{fmtLimite(l.limite_central)}</td>
                  <td>{fmtLimite(l.limite_max)}</td>
                  <td className={styles.accionesFila}>
                    <button className={styles.boton} onClick={() => setEditando(l)}>
                      Editar
                    </button>
                    <button className={styles.botonEliminar} onClick={() => void onEliminar(l)} disabled={borrando === l.id}>
                      {borrando === l.id ? '…' : 'Eliminar'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AnalitosAdminModal({ analitos, onCambio, onCerrar }: Props) {
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [limites, setLimites] = useState<LimiteAnalito[]>([])
  const [borrando, setBorrando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarLimites()
      .then(setLimites)
      .catch(() => setLimites([]))
  }, [])

  function resumenLimites(a: Analito): string {
    const n = limites.filter((l) => l.analito_id === a.id).length
    return n === 0 ? 'Sin límites' : `${n} combinación(es)`
  }

  function onGuardado(analito: Analito) {
    const existe = analitos.some((a) => a.id === analito.id)
    onCambio(existe ? analitos.map((a) => (a.id === analito.id ? analito : a)) : [...analitos, analito])
    setPanel({ modo: 'lista' })
  }

  async function onEliminar(analito: Analito) {
    if (!confirm(`¿Eliminar el analito ${analito.codigo} (${analito.laboratorio})? Esta acción no se puede deshacer.`)) return
    setError(null)
    setBorrando(analito.id)
    try {
      await eliminarAnalito(analito.id)
      onCambio(analitos.filter((a) => a.id !== analito.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el analito.')
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecera}>
          <h3>Gestionar analitos</h3>
          <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {panel.modo === 'limites' ? (
          <LimitesPanel
            analito={panel.analito}
            limites={limites.filter((l) => l.analito_id === panel.analito.id)}
            onCambio={(nuevos) =>
              setLimites((prev) => [...prev.filter((l) => l.analito_id !== panel.analito.id), ...nuevos])
            }
            onVolver={() => setPanel({ modo: 'lista' })}
          />
        ) : panel.modo === 'lista' ? (
          <>
            <div className={styles.cabeceraTabla}>
              <p className={styles.contador}>{analitos.length} analito(s) en el catálogo</p>
              <Button onClick={() => setPanel({ modo: 'nuevo' })}>+ Nuevo analito</Button>
            </div>
            {error && <p className={styles.error}>⚠ {error}</p>}

            {/* Desktop: tabla compacta (una sola columna de límites, sin scroll horizontal). */}
            <div className={styles.tablaScroll}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Laboratorio</th>
                    <th>Unidad</th>
                    <th>Límites</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {analitos.map((a) => (
                    <tr key={a.id}>
                      <td className={styles.codigo}>{a.codigo}</td>
                      <td className={styles.nombreCelda} title={a.nombre}>{a.nombre}</td>
                      <td className={`${styles.faint} ${styles.labCelda}`} title={a.laboratorio}>{a.laboratorio}</td>
                      <td className={`${styles.faint} ${styles.unidadCelda}`} title={a.unidad}>{a.unidad}</td>
                      <td className={`${styles.faint} ${styles.limitesCelda}`}>{resumenLimites(a)}</td>
                      <td>
                        <Badge tone={a.activo ? 'success' : 'neutral'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className={styles.accionesFila}>
                        <button className={styles.boton} onClick={() => setPanel({ modo: 'limites', analito: a })}>
                          Límites
                        </button>
                        <button className={styles.boton} onClick={() => setPanel({ modo: 'editar', analito: a })}>
                          Editar
                        </button>
                        <button
                          className={styles.botonEliminar}
                          onClick={() => void onEliminar(a)}
                          disabled={borrando === a.id}
                        >
                          {borrando === a.id ? '…' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas apiladas, sin scroll horizontal. */}
            <div className={styles.tarjetas}>
              {analitos.map((a) => (
                <div key={a.id} className={styles.tarjeta}>
                  <div className={styles.tarjetaCabecera}>
                    <span className={styles.codigo}>{a.codigo}</span>
                    <Badge tone={a.activo ? 'success' : 'neutral'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                  <p className={styles.tarjetaNombre}>{a.nombre}</p>
                  <div className={styles.tarjetaDatos}>
                    <span>{a.laboratorio}</span>
                    <span>{a.unidad}</span>
                  </div>
                  <p className={styles.tarjetaLimites}>Límites: {resumenLimites(a)}</p>
                  <div className={styles.tarjetaAcciones}>
                    <button className={styles.boton} onClick={() => setPanel({ modo: 'limites', analito: a })}>
                      Límites
                    </button>
                    <button className={styles.boton} onClick={() => setPanel({ modo: 'editar', analito: a })}>
                      Editar
                    </button>
                    <button
                      className={styles.botonEliminar}
                      onClick={() => void onEliminar(a)}
                      disabled={borrando === a.id}
                    >
                      {borrando === a.id ? '…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <AnalitoForm
            analito={panel.modo === 'editar' ? panel.analito : undefined}
            onGuardado={onGuardado}
            onCancelar={() => setPanel({ modo: 'lista' })}
          />
        )}
      </div>
    </div>
  )
}
