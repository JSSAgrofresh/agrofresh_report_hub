import { useMemo, useState } from 'react'
import type { CuentaConPortal, EstadoTemasCuenta, TemaCuenta, TipoConPortal } from '@/features/funciones'
import { NOMBRE_TEMA } from './nombreTema'
import styles from './EstiloPorCuenta.module.css'

const TIPOS: { id: TipoConPortal; nombre: string; detalle: string }[] = [
  { id: 'cliente', nombre: 'Clientes', detalle: 'Cuentas de cliente (su Sold To / Ship To).' },
  { id: 'comercial', nombre: 'Comerciales', detalle: 'Cuentas comerciales (solo lectura y solo sus plantas).' },
]

export type DestinoTema = { tipo: TipoConPortal } | { usuario_id: string }

/** Los estilos que se pueden dejar a una cuenta de ese tipo. El marco interno solo vale para comerciales. */
function opciones(tipo: TipoConPortal): TemaCuenta[] {
  return tipo === 'comercial' ? ['basico', 'sobrio', 'clasico'] : ['basico', 'sobrio']
}

/**
 * Administración General → Funciones: el estilo del dashboard por TIPO de cuenta y por CUENTA. Una cuenta con
 * regla propia gana a la de su tipo, y esa al predeterminado de arriba. Cambiar pide la contraseña del
 * administrador principal (la pide el panel).
 */
export function EstiloPorCuenta({
  temas,
  predeterminado,
  puedeCambiar,
  onCambiar,
}: {
  temas: EstadoTemasCuenta
  predeterminado: TemaCuenta
  puedeCambiar: boolean
  onCambiar: (destino: DestinoTema, tema: TemaCuenta | null, descripcion: string) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [solo, setSolo] = useState<'todas' | 'propias'>('todas')
  const cuentas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return temas.cuentas.filter(
      (c) =>
        (solo === 'todas' || c.propio) &&
        (!q || `${c.nombre} ${c.email} ${c.cliente ?? ''} ${c.planta ?? ''}`.toLowerCase().includes(q)),
    )
  }, [temas.cuentas, buscar, solo])
  const propias = temas.cuentas.filter((c) => c.propio).length

  return (
    <div className={styles.contenedor}>
      <h3 className={styles.sub}>Por tipo de cuenta</h3>
      <ul className={styles.lista}>
        {TIPOS.map((t) => {
          const valor = temas.tipos[t.id]
          return (
            <li key={t.id} className={styles.fila}>
              <span className={styles.nombre}>
                {t.nombre}
                <small>{t.detalle}</small>
              </span>
              <select
                className={styles.select}
                value={valor ?? ''}
                disabled={!puedeCambiar}
                aria-label={`Estilo para ${t.nombre.toLowerCase()}`}
                onChange={(e) =>
                  onCambiar(
                    { tipo: t.id },
                    (e.target.value || null) as TemaCuenta | null,
                    `las cuentas de ${t.nombre.toLowerCase()}`,
                  )
                }
              >
                <option value="">Predeterminado ({NOMBRE_TEMA[predeterminado]})</option>
                {opciones(t.id).map((o) => (
                  <option key={o} value={o}>
                    {NOMBRE_TEMA[o]}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>

      <h3 className={styles.sub}>
        Por cuenta <span className={styles.cuenta}>{propias} con estilo propio</span>
      </h3>
      <div className={styles.barra}>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Buscar una cuenta (nombre, correo, cliente)…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          aria-label="Buscar una cuenta"
        />
        <div className={styles.chips} role="group" aria-label="Cuáles ver">
          <button type="button" aria-pressed={solo === 'todas'} className={solo === 'todas' ? styles.chipOn : styles.chip} onClick={() => setSolo('todas')}>
            Todas ({temas.cuentas.length})
          </button>
          <button type="button" aria-pressed={solo === 'propias'} className={solo === 'propias' ? styles.chipOn : styles.chip} onClick={() => setSolo('propias')}>
            Con estilo propio ({propias})
          </button>
        </div>
      </div>
      {cuentas.length === 0 ? (
        <p className={styles.vacio}>{temas.cuentas.length === 0 ? 'Todavía no hay cuentas de cliente ni de comercial.' : 'Ninguna cuenta coincide.'}</p>
      ) : (
        <ul className={`${styles.lista} ${styles.scroll}`}>
          {cuentas.map((c: CuentaConPortal) => (
            <li key={c.id} className={styles.fila}>
              <span className={styles.nombre}>
                {c.nombre}
                <small>
                  {c.tipo === 'comercial' ? 'Comercial' : 'Cliente'} · {c.email}
                  {c.cliente ? ` · ${c.cliente}` : ''}
                </small>
              </span>
              <span className={c.propio ? styles.propio : styles.hereda}>{c.propio ? 'Propio' : 'Hereda'}</span>
              <select
                className={styles.select}
                value={c.propio ? c.tema : ''}
                disabled={!puedeCambiar}
                aria-label={`Estilo de ${c.nombre}`}
                onChange={(e) => onCambiar({ usuario_id: c.id }, (e.target.value || null) as TemaCuenta | null, `la cuenta de ${c.nombre}`)}
              >
                <option value="">Como su tipo ({NOMBRE_TEMA[c.propio ? (temas.tipos[c.tipo] ?? predeterminado) : c.tema]})</option>
                {opciones(c.tipo).map((o) => (
                  <option key={o} value={o}>
                    {NOMBRE_TEMA[o]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
