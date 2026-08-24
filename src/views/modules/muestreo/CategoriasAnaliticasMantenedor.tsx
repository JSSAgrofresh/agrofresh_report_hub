import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LABORATORIOS } from '@/features/tomaMuestras'
import type { CategoriaAnaliticaConfig, CategoriaAnaliticaInput, Laboratorio } from '@/features/tomaMuestras'
import { cn } from '@/lib/cn'
import styles from './MuestreoConfigView.module.css'

interface CategoriasAnaliticasMantenedorProps {
  categorias: CategoriaAnaliticaConfig[]
  onCrear: (datos: CategoriaAnaliticaInput) => Promise<void>
  onEditar: (id: number, datos: CategoriaAnaliticaInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

export function CategoriasAnaliticasMantenedor({
  categorias,
  onCrear,
  onEditar,
  onEliminar,
}: CategoriasAnaliticasMantenedorProps) {
  const [laboratorio, setLaboratorio] = useState<Laboratorio>('QUITECA')
  const [nombre, setNombre] = useState('')

  const categoriasDelLab = categorias.filter((c) => c.laboratorio === laboratorio).sort((a, b) => a.orden - b.orden)

  async function agregar() {
    if (!nombre.trim()) return
    await onCrear({ laboratorio, nombre: nombre.trim(), activo: true, orden: categoriasDelLab.length + 1 })
    setNombre('')
  }

  return (
    <div>
      <div className={styles.tabsLaboratorio}>
        {LABORATORIOS.map((l) => (
          <button
            key={l}
            type="button"
            className={cn(styles.tabLaboratorio, laboratorio === l && styles.tabLaboratorioActiva)}
            onClick={() => setLaboratorio(l)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Activo</th>
              <th>Orden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categoriasDelLab.map((c) => (
              <tr key={c.id}>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={c.nombre}
                    onChange={(e) => onEditar(c.id, { laboratorio, nombre: e.target.value, activo: c.activo, orden: c.orden })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={c.activo}
                    onChange={(e) => onEditar(c.id, { laboratorio, nombre: c.nombre, activo: e.target.checked, orden: c.orden })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={c.orden}
                    onChange={(e) =>
                      onEditar(c.id, { laboratorio, nombre: c.nombre, activo: c.activo, orden: Number(e.target.value) })
                    }
                  />
                </td>
                <td className={styles.acciones}>
                  <button className={styles.botonEliminar} onClick={() => onEliminar(c.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input
                  className={styles.inputCelda}
                  placeholder="Nueva categoría…"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregar()}
                />
              </td>
              <td colSpan={2}></td>
              <td>
                <Button type="button" variant="secondary" onClick={agregar}>
                  + Agregar
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
