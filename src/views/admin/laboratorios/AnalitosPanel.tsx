import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearAnalitoConfig, actualizarAnalitoConfig, eliminarAnalitoConfig } from '@/features/tomaMuestras'
import type { AnalitoConfig, AnalitoInput, CategoriaAnaliticaConfig } from '@/features/tomaMuestras'
import type { Unidad } from '@/features/laboratorios'
import styles from './LaboratoriosView.module.css'

interface AnalitosPanelProps {
  laboratorio: string
  analitos: AnalitoConfig[]
  categorias: CategoriaAnaliticaConfig[]
  unidades: Unidad[]
  onCambio: (analitos: AnalitoConfig[]) => void
  onError: (mensaje: string | null) => void
}

const VACIO = { codigo: '', nombre: '', unidad: '', categoria: '' }

/** Los analitos siguen viviendo en el mantenedor de Toma de muestras -son los
 * que consume el formulario de solicitud-. Este panel es la misma lista
 * acotada a un laboratorio, para poder mantenerla sin salir de su ficha. */
export function AnalitosPanel({
  laboratorio,
  analitos,
  categorias,
  unidades,
  onCambio,
  onError,
}: AnalitosPanelProps) {
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [borrador, setBorrador] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)

  const delLab = analitos.filter((a) => a.laboratorio === laboratorio).sort((a, b) => a.orden - b.orden)
  const categoriasDelLab = categorias.filter((c) => c.laboratorio === laboratorio && c.activo)
  const unidadesActivas = unidades.filter((u) => u.activo).sort((a, b) => a.orden - b.orden)

  function abrirNuevo() {
    setEditando(null)
    setCreando(true)
    setBorrador({ ...VACIO, categoria: categoriasDelLab[0]?.nombre ?? '' })
    onError(null)
  }

  function abrirEdicion(a: AnalitoConfig) {
    setCreando(false)
    setEditando(a.id)
    setBorrador({ codigo: a.codigo, nombre: a.nombre, unidad: a.unidad ?? '', categoria: a.categoria })
    onError(null)
  }

  function cerrar() {
    setCreando(false)
    setEditando(null)
    setBorrador(VACIO)
  }

  function datosDe(base?: AnalitoConfig): AnalitoInput {
    return {
      laboratorio,
      categoria: borrador.categoria,
      codigo: borrador.codigo.trim().toUpperCase(),
      nombre: borrador.nombre.trim(),
      unidad: borrador.unidad || null,
      tipo: base?.tipo ?? 'numero',
      dosis_aplicable: base?.dosis_aplicable ?? false,
      requerido: base?.requerido ?? false,
      activo: base?.activo ?? true,
      orden: base?.orden ?? delLab.length + 1,
      tipo_aplicacion: base?.tipo_aplicacion ?? '',
    }
  }

  async function guardar(existente?: AnalitoConfig) {
    if (!borrador.codigo.trim() || !borrador.nombre.trim()) {
      onError('El código y el nombre del analito son obligatorios.')
      return
    }
    setGuardando(true)
    onError(null)
    try {
      if (existente) {
        const actualizado = await actualizarAnalitoConfig(existente.id, datosDe(existente))
        onCambio(analitos.map((a) => (a.id === existente.id ? actualizado : a)))
      } else {
        const nuevo = await crearAnalitoConfig(datosDe())
        onCambio([...analitos, nuevo])
      }
      cerrar()
    } catch {
      onError('No se pudo guardar el analito.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(a: AnalitoConfig) {
    onError(null)
    try {
      const { id, ...datos } = a
      const actualizado = await actualizarAnalitoConfig(id, { ...datos, activo: !a.activo })
      onCambio(analitos.map((x) => (x.id === id ? actualizado : x)))
    } catch {
      onError('No se pudo cambiar el estado del analito.')
    }
  }

  async function borrar(a: AnalitoConfig) {
    if (!window.confirm(`¿Eliminar el analito "${a.nombre}"?`)) return
    onError(null)
    try {
      await eliminarAnalitoConfig(a.id)
      onCambio(analitos.filter((x) => x.id !== a.id))
    } catch {
      onError('No se pudo eliminar el analito.')
    }
  }

  function formulario(existente?: AnalitoConfig) {
    return (
      <div className={styles.formulario}>
        <div className={styles.formGrilla}>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Código</label>
            <input
              className={cn(styles.input, styles.inputMono)}
              value={borrador.codigo}
              autoFocus
              placeholder="FDL"
              onChange={(e) => setBorrador({ ...borrador, codigo: e.target.value.toUpperCase() })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Nombre</label>
            <input
              className={styles.input}
              value={borrador.nombre}
              placeholder="Fludioxonil"
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Unidad</label>
            <select
              className={styles.select}
              value={borrador.unidad}
              onChange={(e) => setBorrador({ ...borrador, unidad: e.target.value })}
            >
              <option value="">Sin unidad</option>
              {unidadesActivas.map((u) => (
                <option key={u.id} value={u.simbolo}>
                  {u.simbolo}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta}>Categoría</label>
            <select
              className={styles.select}
              value={borrador.categoria}
              onChange={(e) => setBorrador({ ...borrador, categoria: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categoriasDelLab.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.formAcciones}>
          <Button variant="secondary" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => guardar(existente)} disabled={guardando}>
            {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar analito'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className={styles.seccion}>
      <div className={styles.seccionCabecera}>
        <div>
          <h3 className={styles.seccionTitulo}>Analitos</h3>
          <p className={styles.seccionNota}>
            Lo que este laboratorio puede medir. Los análisis se arman eligiendo de esta lista.
          </p>
        </div>
        {!creando && <Button variant="secondary" onClick={abrirNuevo}>Agregar analito</Button>}
      </div>

      {creando && formulario()}

      {delLab.length === 0 && !creando ? (
        <div className={styles.vacio}>
          <span className={styles.vacioTitulo}>Sin analitos</span>
          <span className={styles.vacioNota}>Agrega el primero para poder armar análisis.</span>
        </div>
      ) : (
        delLab.length > 0 && (
          <div className={styles.filas}>
            {delLab.map((a) =>
              editando === a.id ? (
                <div key={a.id} style={{ padding: 'var(--space-3)' }}>
                  {formulario(a)}
                </div>
              ) : (
                <div key={a.id} className={cn(styles.fila, !a.activo && styles.filaInactiva)}>
                  <div className={styles.filaCuerpo}>
                    <div className={styles.filaPrincipal}>
                      {a.nombre} <span className={styles.analitoCodigo}>{a.codigo}</span>
                    </div>
                    <div className={styles.filaSecundario}>
                      {a.categoria || 'Sin categoría'}
                      {a.unidad && ` · ${a.unidad}`}
                    </div>
                  </div>
                  {!a.activo && <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactivo</span>}
                  <div className={styles.filaAcciones}>
                    <button
                      className={styles.iconoBoton}
                      title={a.activo ? 'Desactivar' : 'Activar'}
                      onClick={() => alternarActivo(a)}
                    >
                      {a.activo ? '◉' : '○'}
                    </button>
                    <button className={styles.iconoBoton} title="Editar" onClick={() => abrirEdicion(a)}>
                      ✎
                    </button>
                    <button
                      className={cn(styles.iconoBoton, styles.iconoBotonPeligro)}
                      title="Eliminar"
                      onClick={() => borrar(a)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )
      )}
    </section>
  )
}
