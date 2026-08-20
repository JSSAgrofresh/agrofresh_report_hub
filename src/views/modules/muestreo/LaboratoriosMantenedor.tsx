import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LABORATORIOS } from '@/features/tomaMuestras'
import type { LaboratorioConfig, LaboratorioInput } from '@/features/tomaMuestras'
import styles from './MuestreoConfigView.module.css'

interface LaboratoriosMantenedorProps {
  laboratorios: LaboratorioConfig[]
  onCrear: (datos: LaboratorioInput) => Promise<void>
  onEditar: (id: number, datos: LaboratorioInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

/** El `codigo` está anclado a las 4 carpetas físicas de Storage
 * (solicitudes/<CODIGO>/) por seguridad de almacenamiento -no se puede
 * inventar uno nuevo desde acá-, pero nombre/descripción/activo/orden sí
 * son enteramente configurables. */
export function LaboratoriosMantenedor({ laboratorios, onCrear, onEditar, onEliminar }: LaboratoriosMantenedorProps) {
  const codigosUsados = laboratorios.map((l) => l.codigo)
  const codigosDisponibles = LABORATORIOS.filter((c) => !codigosUsados.includes(c))
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')

  function campoBase(l: LaboratorioConfig): LaboratorioInput {
    return { codigo: l.codigo, nombre: l.nombre, descripcion: l.descripcion, activo: l.activo, orden: l.orden }
  }

  async function agregar() {
    if (!nuevoCodigo || !nuevoNombre.trim()) return
    await onCrear({
      codigo: nuevoCodigo,
      nombre: nuevoNombre.trim(),
      descripcion: null,
      activo: true,
      orden: laboratorios.length + 1,
    })
    setNuevoCodigo('')
    setNuevoNombre('')
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Activo</th>
            <th>Orden</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {laboratorios
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((l) => (
              <tr key={l.id}>
                <td className={styles.claveMono}>{l.codigo}</td>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={l.nombre}
                    onChange={(e) => onEditar(l.id, { ...campoBase(l), nombre: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={l.descripcion ?? ''}
                    onChange={(e) => onEditar(l.id, { ...campoBase(l), descripcion: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={l.activo}
                    onChange={(e) => onEditar(l.id, { ...campoBase(l), activo: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={l.orden}
                    onChange={(e) => onEditar(l.id, { ...campoBase(l), orden: Number(e.target.value) })}
                  />
                </td>
                <td className={styles.acciones}>
                  <button className={styles.botonEliminar} onClick={() => onEliminar(l.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          {codigosDisponibles.length > 0 && (
            <tr>
              <td>
                <select value={nuevoCodigo} onChange={(e) => setNuevoCodigo(e.target.value)}>
                  <option value="">— código —</option>
                  {codigosDisponibles.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className={styles.inputCelda}
                  placeholder="Nombre"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
              </td>
              <td colSpan={3}></td>
              <td>
                <Button type="button" variant="secondary" onClick={agregar}>
                  + Agregar
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
