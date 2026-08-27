import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearUnidad, actualizarUnidad, eliminarUnidad } from '@/features/laboratorios'
import type { Unidad, UnidadInput } from '@/features/laboratorios'
import styles from './LaboratoriosView.module.css'

interface UnidadesPanelProps {
  unidades: Unidad[]
  onCambio: (unidades: Unidad[]) => void
  onError: (mensaje: string | null) => void
}

const VACIO = { simbolo: '', nombre: '' }

/** Las unidades son transversales a todos los laboratorios, así que este
 * panel no vive dentro de la ficha de uno: se abre desde la grilla. */
export function UnidadesPanel({ unidades, onCambio, onError }: UnidadesPanelProps) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [borrador, setBorrador] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)

  const ordenadas = [...unidades].sort((a, b) => a.orden - b.orden)

  function abrirNuevo() {
    setEditando(null)
    setCreando(true)
    setBorrador(VACIO)
    onError(null)
  }

  function abrirEdicion(u: Unidad) {
    setCreando(false)
    setEditando(u.id)
    setBorrador({ simbolo: u.simbolo, nombre: u.nombre })
    onError(null)
  }

  function cerrar() {
    setCreando(false)
    setEditando(null)
    setBorrador(VACIO)
  }

  function datosDe(base?: Unidad): UnidadInput {
    return {
      simbolo: borrador.simbolo.trim(),
      nombre: borrador.nombre.trim(),
      activo: base?.activo ?? true,
      orden: base?.orden ?? unidades.length + 1,
    }
  }

  async function guardar(existente?: Unidad) {
    const simbolo = borrador.simbolo.trim()
    if (!simbolo) {
      onError('El símbolo de la unidad es obligatorio.')
      return
    }
    if (unidades.some((u) => u.simbolo === simbolo && u.id !== existente?.id)) {
      onError(`Ya existe una unidad con el símbolo "${simbolo}".`)
      return
    }
    setGuardando(true)
    onError(null)
    try {
      if (existente) {
        const actualizada = await actualizarUnidad(existente.id, datosDe(existente))
        onCambio(unidades.map((u) => (u.id === existente.id ? actualizada : u)))
      } else {
        const nueva = await crearUnidad(datosDe())
        onCambio([...unidades, nueva])
      }
      cerrar()
    } catch {
      onError('No se pudo guardar la unidad.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(u: Unidad) {
    onError(null)
    try {
      const { id, ...datos } = u
      const actualizada = await actualizarUnidad(id, { ...datos, activo: !u.activo })
      onCambio(unidades.map((x) => (x.id === id ? actualizada : x)))
    } catch {
      onError('No se pudo cambiar el estado de la unidad.')
    }
  }

  async function borrar(u: Unidad) {
    if (!window.confirm(`¿Eliminar la unidad "${u.simbolo}"? Los análisis que la usen quedarán sin unidad.`)) return
    onError(null)
    try {
      await eliminarUnidad(u.id)
      onCambio(unidades.filter((x) => x.id !== u.id))
    } catch {
      onError('No se pudo eliminar la unidad.')
    }
  }

  function formulario(existente?: Unidad) {
    return (
      <div className={styles.formulario}>
        <div className={styles.formGrilla}>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Símbolo</label>
            <input
              className={cn(styles.input, styles.inputMono)}
              value={borrador.simbolo}
              autoFocus
              placeholder="mg/kg"
              onChange={(e) => setBorrador({ ...borrador, simbolo: e.target.value })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Nombre (opcional)</label>
            <input
              className={styles.input}
              value={borrador.nombre}
              placeholder="Miligramo por kilogramo"
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.formAcciones}>
          <Button variant="secondary" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => guardar(existente)} disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar unidad'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className={styles.seccion}>
      <div className={styles.seccionCabecera}>
        <div>
          <h3 className={styles.seccionTitulo}>Unidades de medida</h3>
          <p className={styles.seccionNota}>
            Las escalas disponibles al armar un análisis. Son comunes a todos los laboratorios.
          </p>
        </div>
        {!creando && <Button variant="secondary" onClick={abrirNuevo}>Agregar unidad</Button>}
      </div>

      {creando && formulario()}

      <div className={styles.filas}>
        {ordenadas.map((u) =>
          editando === u.id ? (
            <div key={u.id} style={{ padding: 'var(--space-3)' }}>
              {formulario(u)}
            </div>
          ) : (
            <div key={u.id} className={cn(styles.fila, !u.activo && styles.filaInactiva)}>
              <div className={styles.filaCuerpo}>
                <div className={cn(styles.filaPrincipal, styles.inputMono)}>{u.simbolo}</div>
                {u.nombre && <div className={styles.filaSecundario}>{u.nombre}</div>}
              </div>
              {!u.activo && <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactiva</span>}
              <div className={styles.filaAcciones}>
                <button
                  className={styles.iconoBoton}
                  title={u.activo ? 'Desactivar' : 'Activar'}
                  onClick={() => alternarActivo(u)}
                >
                  {u.activo ? '◉' : '○'}
                </button>
                <button className={styles.iconoBoton} title="Editar" onClick={() => abrirEdicion(u)}>
                  ✎
                </button>
                <button
                  className={cn(styles.iconoBoton, styles.iconoBotonPeligro)}
                  title="Eliminar"
                  onClick={() => borrar(u)}
                >
                  ✕
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  )
}
