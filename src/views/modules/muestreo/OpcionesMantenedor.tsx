import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { OpcionConfig, OpcionInput } from '@/features/tomaMuestras'
import styles from './MuestreoConfigView.module.css'

interface OpcionesMantenedorProps {
  opciones: OpcionConfig[]
  onCrear: (datos: OpcionInput) => Promise<void>
  onEditar: (id: number, datos: OpcionInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

/** Mantenedor genérico para listas simples (nombre + activo + orden): lo
 * reutilizan Tipos de aplicación y Líneas de proceso, que comparten
 * exactamente la misma forma. */
export function OpcionesMantenedor({ opciones, onCrear, onEditar, onEliminar }: OpcionesMantenedorProps) {
  const [nombreNuevo, setNombreNuevo] = useState('')

  async function agregar() {
    if (!nombreNuevo.trim()) return
    await onCrear({ nombre: nombreNuevo.trim(), activo: true, orden: opciones.length + 1 })
    setNombreNuevo('')
  }

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Orden</th>
            <th>Activo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {opciones
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((o) => (
              <tr key={o.id}>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={o.nombre}
                    onChange={(e) => onEditar(o.id, { nombre: e.target.value, activo: o.activo, orden: o.orden })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={o.orden}
                    onChange={(e) =>
                      onEditar(o.id, { nombre: o.nombre, activo: o.activo, orden: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={o.activo}
                    onChange={(e) => onEditar(o.id, { nombre: o.nombre, activo: e.target.checked, orden: o.orden })}
                  />
                </td>
                <td className={styles.acciones}>
                  <button className={styles.botonEliminar} onClick={() => onEliminar(o.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          <tr>
            <td colSpan={2}>
              <input
                className={styles.inputCelda}
                placeholder="Nuevo…"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregar()}
              />
            </td>
            <td colSpan={2}>
              <Button type="button" variant="secondary" onClick={agregar}>
                + Agregar
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
