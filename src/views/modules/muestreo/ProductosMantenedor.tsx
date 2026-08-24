import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LABORATORIOS } from '@/features/tomaMuestras'
import type { Laboratorio, OpcionConfig, ProductoConfig, ProductoInput } from '@/features/tomaMuestras'
import { cn } from '@/lib/cn'
import styles from './MuestreoConfigView.module.css'

interface ProductosMantenedorProps {
  productos: ProductoConfig[]
  tiposAplicacion: OpcionConfig[]
  onCrear: (datos: ProductoInput) => Promise<void>
  onEditar: (id: number, datos: ProductoInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

const PRODUCTO_NUEVO_VACIO = { nombre: '', codigo: '' }

export function ProductosMantenedor({ productos, tiposAplicacion, onCrear, onEditar, onEliminar }: ProductosMantenedorProps) {
  const [laboratorio, setLaboratorio] = useState<Laboratorio>('QUITECA')
  const [nuevo, setNuevo] = useState(PRODUCTO_NUEVO_VACIO)

  const productosDelLab = productos.filter((p) => p.laboratorio === laboratorio).sort((a, b) => a.orden - b.orden)
  const tiposActivos = tiposAplicacion.filter((t) => t.activo)

  function campoBase(p: ProductoConfig): ProductoInput {
    return {
      nombre: p.nombre,
      codigo: p.codigo,
      laboratorio: p.laboratorio,
      tipo_aplicacion: p.tipo_aplicacion,
      activo: p.activo,
      orden: p.orden,
    }
  }

  async function agregar() {
    if (!nuevo.nombre.trim()) return
    await onCrear({
      nombre: nuevo.nombre.trim(),
      codigo: nuevo.codigo.trim() || null,
      laboratorio,
      tipo_aplicacion: '',
      activo: true,
      orden: productosDelLab.length + 1,
    })
    setNuevo(PRODUCTO_NUEVO_VACIO)
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
              <th>Código</th>
              <th>Tipo de aplicación</th>
              <th>Activo</th>
              <th>Orden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productosDelLab.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={p.nombre}
                    onChange={(e) => onEditar(p.id, { ...campoBase(p), nombre: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputCeldaChico}
                    value={p.codigo ?? ''}
                    onChange={(e) => onEditar(p.id, { ...campoBase(p), codigo: e.target.value || null })}
                  />
                </td>
                <td>
                  <select
                    value={p.tipo_aplicacion}
                    onChange={(e) => onEditar(p.id, { ...campoBase(p), tipo_aplicacion: e.target.value })}
                  >
                    <option value="">— cualquiera —</option>
                    {tiposActivos.map((t) => (
                      <option key={t.id} value={t.nombre}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.activo}
                    onChange={(e) => onEditar(p.id, { ...campoBase(p), activo: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={p.orden}
                    onChange={(e) => onEditar(p.id, { ...campoBase(p), orden: Number(e.target.value) })}
                  />
                </td>
                <td className={styles.acciones}>
                  <button className={styles.botonEliminar} onClick={() => onEliminar(p.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input
                  className={styles.inputCelda}
                  placeholder="Nombre"
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className={styles.inputCeldaChico}
                  placeholder="Código"
                  value={nuevo.codigo}
                  onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value }))}
                />
              </td>
              <td colSpan={3}></td>
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
