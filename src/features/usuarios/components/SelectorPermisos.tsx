import type { AreaId } from '@/constants/areas'
import { CATEGORIAS, RESERVADOS, alternarPermiso, incluidoPorTipo, marcarCategoria } from '../catalogoPermisos'

const TODOS = CATEGORIAS.flatMap((c) => c.permisos)
import type { Permiso } from '../catalogoPermisos'
import type { TipoAcceso } from '../types'
import styles from './SelectorPermisos.module.css'

interface Props {
  valor: string[]
  onChange: (siguiente: string[]) => void
  tipo: TipoAcceso
  area?: AreaId
  /** Muestra todo tal cual está, sin dejar cambiar nada (administrador general y gerencia). */
  soloLectura?: boolean
  /** Motivo por el que un permiso no se puede dar a este tipo de cuenta (se muestra apagado y no se marca nunca);
   * `null` = disponible. */
  noDisponible?: (permiso: Permiso) => string | null
}

function Fila({ permiso, nivel, valor, onChange, tipo, area, soloLectura, noDisponible }: Props & { permiso: Permiso; nivel: number }) {
  const incluido = incluidoPorTipo(permiso, tipo, area)
  const motivo = noDisponible?.(permiso) ?? null
  const marcado = !motivo && (incluido || valor.includes(permiso.id))
  const bloqueado = soloLectura || incluido || motivo != null
  return (
    <label className={`${styles.fila} ${nivel > 0 ? styles.hijo : ''} ${permiso.extra ? styles.extra : ''} ${motivo ? styles.apagada : ''}`}>
      <input type="checkbox" checked={marcado} disabled={bloqueado} onChange={() => onChange(alternarPermiso(valor, permiso.id))} />
      <span className={styles.texto}>
        <strong>
          {permiso.nombre}
          {permiso.extra && <em className={styles.etiqueta}>función suelta</em>}
          {incluido && <em className={styles.etiquetaTipo}>incluido por su tipo de cuenta</em>}
          {motivo && <em className={styles.etiquetaTipo} title={motivo}>aún no disponible</em>}
        </strong>
        <small>{permiso.descripcion}</small>
      </span>
    </label>
  )
}

export function SelectorPermisos(propsOriginales: Props) {
  const { valor, soloLectura, noDisponible } = propsOriginales
  // Lo que no se puede dar a este tipo de cuenta nunca entra en la selección, ni con «Marcar todo».
  const onChange = (siguiente: string[]) => {
    const permitidos = noDisponible ? siguiente.filter((id) => !noDisponible(TODOS.find((p) => p.id === id) as Permiso)) : siguiente
    propsOriginales.onChange(permitidos)
  }
  const props = { ...propsOriginales, onChange }
  const hijos = (id: string) => CATEGORIAS.flatMap((c) => c.permisos).filter((p) => p.padre === id)

  function ramas(permiso: Permiso, nivel: number): React.ReactNode {
    return (
      <div key={permiso.id}>
        <Fila {...props} permiso={permiso} nivel={nivel} />
        {hijos(permiso.id).length > 0 && (
          <div className={styles.hijos}>{hijos(permiso.id).map((h) => ramas(h, nivel + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.selector}>
      {CATEGORIAS.map((cat) => {
        const ids = cat.permisos.map((p) => p.id)
        const activos = ids.filter((id) => valor.includes(id)).length
        const todos = activos === ids.length
        return (
          <section className={styles.categoria} key={cat.id} aria-label={cat.nombre}>
            <header className={styles.cabecera}>
              <div>
                <h3>{cat.nombre}</h3>
                <p>{cat.descripcion}</p>
              </div>
              <div className={styles.lado}>
                <span className={styles.cuenta}>{activos} de {ids.length}</span>
                {!soloLectura && (
                  <button type="button" className={styles.marcar} onClick={() => onChange(marcarCategoria(valor, cat.id, !todos))}>
                    {todos ? 'Quitar todo' : 'Marcar todo'}
                  </button>
                )}
              </div>
            </header>
            <div className={styles.cuerpo}>{cat.permisos.filter((p) => !p.padre).map((p) => ramas(p, 0))}</div>
          </section>
        )
      })}

      <section className={`${styles.categoria} ${styles.reservada}`} aria-label="Solo administrador general">
        <header className={styles.cabecera}>
          <div>
            <h3>🔒 Administración</h3>
            <p>Solo las ve y las usa el administrador general. No se pueden asignar a otras cuentas.</p>
          </div>
        </header>
        <ul className={styles.bloqueadas}>
          {RESERVADOS.map((r) => (
            <li key={r.nombre}>
              <strong>{r.nombre}</strong>
              <small>{r.descripcion}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
