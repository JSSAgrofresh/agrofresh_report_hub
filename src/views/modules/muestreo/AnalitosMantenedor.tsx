import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LABORATORIOS } from '@/features/tomaMuestras'
import type { AnalitoConfig, AnalitoInput, CategoriaAnaliticaConfig, Laboratorio, OpcionConfig } from '@/features/tomaMuestras'
import { cn } from '@/lib/cn'
import styles from './MuestreoConfigView.module.css'

interface AnalitosMantenedorProps {
  analitos: AnalitoConfig[]
  categorias: CategoriaAnaliticaConfig[]
  tiposAplicacion: OpcionConfig[]
  onCrear: (datos: AnalitoInput) => Promise<void>
  onEditar: (id: number, datos: AnalitoInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

const ANALITO_NUEVO_VACIO = { codigo: '', nombre: '', unidad: '' }

export function AnalitosMantenedor({
  analitos,
  categorias,
  tiposAplicacion,
  onCrear,
  onEditar,
  onEliminar,
}: AnalitosMantenedorProps) {
  const [laboratorio, setLaboratorio] = useState<Laboratorio>('QUITECA')
  const [nuevo, setNuevo] = useState(ANALITO_NUEVO_VACIO)

  const analitosDelLab = analitos.filter((a) => a.laboratorio === laboratorio).sort((a, b) => a.orden - b.orden)
  const categoriasDelLab = categorias.filter((c) => c.laboratorio === laboratorio && c.activo)
  const tiposActivos = tiposAplicacion.filter((t) => t.activo)

  function campoBase(a: AnalitoConfig): AnalitoInput {
    return {
      laboratorio: a.laboratorio,
      categoria: a.categoria,
      codigo: a.codigo,
      nombre: a.nombre,
      unidad: a.unidad,
      tipo: a.tipo,
      dosis_aplicable: a.dosis_aplicable,
      requerido: a.requerido,
      activo: a.activo,
      orden: a.orden,
      tipo_aplicacion: a.tipo_aplicacion,
    }
  }

  async function agregar() {
    if (!nuevo.codigo.trim() || !nuevo.nombre.trim()) return
    await onCrear({
      laboratorio,
      categoria: categoriasDelLab[0]?.nombre ?? '',
      codigo: nuevo.codigo.trim(),
      nombre: nuevo.nombre.trim(),
      unidad: nuevo.unidad.trim() || null,
      tipo: 'numero',
      dosis_aplicable: laboratorio === 'QUITECA' || laboratorio === 'AGROFRESH',
      requerido: false,
      activo: true,
      orden: analitosDelLab.length + 1,
      tipo_aplicacion: '',
    })
    setNuevo(ANALITO_NUEVO_VACIO)
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
              <th>Categoría</th>
              <th>Código</th>
              <th>Nombre</th>
              <th>Unidad</th>
              <th>Tipo</th>
              <th>Dosis</th>
              <th>Tipo aplicación</th>
              <th>Requerido</th>
              <th>Activo</th>
              <th>Orden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {analitosDelLab.map((a) => (
              <tr key={a.id}>
                <td>
                  <select value={a.categoria} onChange={(e) => onEditar(a.id, { ...campoBase(a), categoria: e.target.value })}>
                    <option value="">— sin categoría —</option>
                    {categoriasDelLab.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.inputCeldaChico}
                    value={a.codigo}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), codigo: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={a.nombre}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), nombre: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputCeldaChico}
                    value={a.unidad ?? ''}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), unidad: e.target.value || null })}
                  />
                </td>
                <td>
                  <select
                    value={a.tipo}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), tipo: e.target.value as 'numero' | 'texto' })}
                  >
                    <option value="numero">Número</option>
                    <option value="texto">Texto</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={a.dosis_aplicable}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), dosis_aplicable: e.target.checked })}
                  />
                </td>
                <td>
                  <select
                    value={a.tipo_aplicacion}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), tipo_aplicacion: e.target.value })}
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
                    checked={a.requerido}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), requerido: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={a.activo}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), activo: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={a.orden}
                    onChange={(e) => onEditar(a.id, { ...campoBase(a), orden: Number(e.target.value) })}
                  />
                </td>
                <td className={styles.acciones}>
                  <button className={styles.botonEliminar} onClick={() => onEliminar(a.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td></td>
              <td>
                <input
                  className={styles.inputCeldaChico}
                  placeholder="Código"
                  value={nuevo.codigo}
                  onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value }))}
                />
              </td>
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
                  placeholder="Unidad"
                  value={nuevo.unidad}
                  onChange={(e) => setNuevo((n) => ({ ...n, unidad: e.target.value }))}
                />
              </td>
              <td colSpan={6}></td>
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
