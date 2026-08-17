import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDecimalCL, parseDecimalCL } from '@/lib/locale'
import { crearAnalito, actualizarAnalito, eliminarAnalito } from '@/features/reportes'
import type { Analito, AnalitoInput } from '@/features/reportes'
import styles from './AnalitosAdminModal.module.css'

type Panel = { modo: 'lista' } | { modo: 'nuevo' } | { modo: 'editar'; analito: Analito }

interface Props {
  analitos: Analito[]
  onCambio: (analitos: Analito[]) => void
  onCerrar: () => void
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : parseDecimalCL(s)
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
  const [activo, setActivo] = useState(analito?.activo ?? true)
  const [limiteMin, setLimiteMin] = useState(analito?.limite_min != null ? formatDecimalCL(Number(analito.limite_min), 4) : '')
  const [limiteCentral, setLimiteCentral] = useState(
    analito?.limite_central != null ? formatDecimalCL(Number(analito.limite_central), 4) : '',
  )
  const [limiteMax, setLimiteMax] = useState(analito?.limite_max != null ? formatDecimalCL(Number(analito.limite_max), 4) : '')
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
      activo,
      limite_min: numOrNull(limiteMin),
      limite_central: numOrNull(limiteCentral),
      limite_max: numOrNull(limiteMax),
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

      <p className={styles.subtitulo}>Límites residuales (los de control se calculan solos: promedio ± N desviaciones estándar)</p>
      <div className={styles.filaTres}>
        <label className={styles.campo}>
          <span>Mínimo</span>
          <input value={limiteMin} onChange={(e) => setLimiteMin(e.target.value)} placeholder="0,00" />
        </label>
        <label className={styles.campo}>
          <span>Central</span>
          <input value={limiteCentral} onChange={(e) => setLimiteCentral(e.target.value)} placeholder="0,00" />
        </label>
        <label className={styles.campo}>
          <span>Máximo</span>
          <input value={limiteMax} onChange={(e) => setLimiteMax(e.target.value)} placeholder="0,10" />
        </label>
      </div>

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

export function AnalitosAdminModal({ analitos, onCambio, onCerrar }: Props) {
  const [panel, setPanel] = useState<Panel>({ modo: 'lista' })
  const [borrando, setBorrando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

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

        {panel.modo === 'lista' ? (
          <>
            <div className={styles.cabeceraTabla}>
              <p className={styles.contador}>{analitos.length} analito(s) en el catálogo</p>
              <Button onClick={() => setPanel({ modo: 'nuevo' })}>+ Nuevo analito</Button>
            </div>
            {error && <p className={styles.error}>⚠ {error}</p>}
            <div className={styles.tablaScroll}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Laboratorio</th>
                    <th>Unidad</th>
                    <th>Límite mín.</th>
                    <th>Límite central</th>
                    <th>Límite máx.</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {analitos.map((a) => (
                    <tr key={a.id}>
                      <td className={styles.codigo}>{a.codigo}</td>
                      <td>{a.nombre}</td>
                      <td className={styles.faint}>{a.laboratorio}</td>
                      <td className={styles.faint}>{a.unidad}</td>
                      <td>{a.limite_min != null ? formatDecimalCL(Number(a.limite_min), 4) : '—'}</td>
                      <td>{a.limite_central != null ? formatDecimalCL(Number(a.limite_central), 4) : '—'}</td>
                      <td>{a.limite_max != null ? formatDecimalCL(Number(a.limite_max), 4) : '—'}</td>
                      <td>
                        <Badge tone={a.activo ? 'success' : 'neutral'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className={styles.accionesFila}>
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
