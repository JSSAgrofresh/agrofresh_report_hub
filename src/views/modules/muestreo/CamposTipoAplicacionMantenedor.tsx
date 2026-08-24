import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { CampoTipoAplicacionConfig, CampoTipoAplicacionInput, OpcionConfig } from '@/features/tomaMuestras'
import { cn } from '@/lib/cn'
import styles from './MuestreoConfigView.module.css'

interface CamposTipoAplicacionMantenedorProps {
  campos: CampoTipoAplicacionConfig[]
  tiposAplicacion: OpcionConfig[]
  onCrear: (datos: CampoTipoAplicacionInput) => Promise<void>
  onEditar: (id: number, datos: CampoTipoAplicacionInput) => Promise<void>
  onEliminar: (id: number) => Promise<void>
}

const CAMPO_NUEVO_VACIO = { clave: '', etiqueta: '' }

/** Mantenedor de los campos que aparecen en el formulario según el Tipo de
 * Aplicación elegido (Actimist, Línea de proceso, ...): "Común" es un
 * ámbito especial que se muestra siempre que haya un tipo de aplicación
 * seleccionado, independiente de cuál sea. */
export function CamposTipoAplicacionMantenedor({
  campos,
  tiposAplicacion,
  onCrear,
  onEditar,
  onEliminar,
}: CamposTipoAplicacionMantenedorProps) {
  const ambitos = ['comun', ...tiposAplicacion.filter((t) => t.activo).map((t) => t.nombre)]
  const [ambito, setAmbito] = useState(ambitos[0] ?? 'comun')
  const [nuevo, setNuevo] = useState(CAMPO_NUEVO_VACIO)

  const camposDelAmbito = campos.filter((c) => c.ambito === ambito).sort((a, b) => a.orden - b.orden)

  function campoBase(c: CampoTipoAplicacionConfig): CampoTipoAplicacionInput {
    return {
      ambito: c.ambito,
      clave: c.clave,
      etiqueta: c.etiqueta,
      tipo: c.tipo,
      requerido: c.requerido,
      activo: c.activo,
      orden: c.orden,
    }
  }

  async function agregar() {
    if (!nuevo.clave.trim() || !nuevo.etiqueta.trim()) return
    await onCrear({
      ambito,
      clave: nuevo.clave.trim(),
      etiqueta: nuevo.etiqueta.trim(),
      tipo: 'text',
      requerido: false,
      activo: true,
      orden: camposDelAmbito.length + 1,
    })
    setNuevo(CAMPO_NUEVO_VACIO)
  }

  return (
    <div>
      <div className={styles.tabsLaboratorio}>
        {ambitos.map((a) => (
          <button
            key={a}
            type="button"
            className={cn(styles.tabLaboratorio, ambito === a && styles.tabLaboratorioActiva)}
            onClick={() => setAmbito(a)}
          >
            {a === 'comun' ? 'Común' : a}
          </button>
        ))}
      </div>
      <p className={styles.estado}>
        {ambito === 'comun'
          ? 'Estos campos aparecen siempre que haya un Tipo de Aplicación elegido.'
          : `Estos campos aparecen solo cuando Tipo de Aplicación = "${ambito}".`}
      </p>

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Etiqueta</th>
              <th>Tipo</th>
              <th>Requerido</th>
              <th>Activo</th>
              <th>Orden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {camposDelAmbito.map((c) => (
              <tr key={c.id}>
                <td className={styles.claveMono}>{c.clave}</td>
                <td>
                  <input
                    className={styles.inputCelda}
                    value={c.etiqueta}
                    onChange={(e) => onEditar(c.id, { ...campoBase(c), etiqueta: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={c.tipo}
                    onChange={(e) =>
                      onEditar(c.id, { ...campoBase(c), tipo: e.target.value as CampoTipoAplicacionConfig['tipo'] })
                    }
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="time">Hora</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={c.requerido}
                    onChange={(e) => onEditar(c.id, { ...campoBase(c), requerido: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={c.activo}
                    onChange={(e) => onEditar(c.id, { ...campoBase(c), activo: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={styles.inputCeldaChico}
                    value={c.orden}
                    onChange={(e) => onEditar(c.id, { ...campoBase(c), orden: Number(e.target.value) })}
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
                  className={styles.inputCeldaChico}
                  placeholder="clave_interna"
                  value={nuevo.clave}
                  onChange={(e) => setNuevo((n) => ({ ...n, clave: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className={styles.inputCelda}
                  placeholder="Etiqueta"
                  value={nuevo.etiqueta}
                  onChange={(e) => setNuevo((n) => ({ ...n, etiqueta: e.target.value }))}
                />
              </td>
              <td colSpan={4}></td>
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
