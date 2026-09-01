import { useMemo, useState } from 'react'
import { filtrarPorFolio } from '@/features/emitir'
import type { Solicitud } from '@/features/emitir'
import styles from './TablaSolicitudes.module.css'

type Filtro = 'todas' | 'cruzadas' | 'pendientes'

const ETIQUETA: Record<Filtro, string> = {
  todas: 'Todas',
  cruzadas: 'Con muestra',
  pendientes: 'Sin muestra',
}

interface TablaSolicitudesProps {
  solicitudes: Solicitud[] | null
  onVerFicha: (solicitud: Solicitud) => void
  onQuitarCruce: (solicitud: Solicitud) => void
}

/**
 * Todas las solicitudes de AGROFRESH y en qué estado está cada una.
 *
 * El color es la información principal: verde significa que la muestra ya
 * llegó y está esperando su resultado; blanca, que todavía no. Con eso se ve
 * de un vistazo qué falta por recibir, sin leer ninguna columna.
 */
export function TablaSolicitudes({ solicitudes, onVerFicha, onQuitarCruce }: TablaSolicitudesProps) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [buscar, setBuscar] = useState('')

  const cruzadas = useMemo(
    () => (solicitudes ?? []).filter((s) => s.codigo_muestra).length,
    [solicitudes],
  )

  const visibles = useMemo(() => {
    let lista = filtrarPorFolio(solicitudes ?? [], buscar)
    if (filtro === 'cruzadas') lista = lista.filter((s) => s.codigo_muestra)
    if (filtro === 'pendientes') lista = lista.filter((s) => !s.codigo_muestra)
    return lista
  }, [solicitudes, buscar, filtro])

  return (
    <>
      <div className={styles.barra}>
        <div className={styles.filtros} role="tablist">
          {(Object.keys(ETIQUETA) as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filtro === f}
              className={filtro === f ? styles.filtroActivo : styles.filtro}
              onClick={() => setFiltro(f)}
            >
              {ETIQUETA[f]}
            </button>
          ))}
        </div>
        <input
          className={styles.buscar}
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por folio"
        />
        <span className={styles.conteo}>
          {cruzadas} de {solicitudes?.length ?? 0} con muestra
        </span>
      </div>

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>N° Solicitud</th>
              <th>N° Muestra</th>
              <th>Fecha muestreo</th>
              <th>Sold To</th>
              <th>Especie</th>
              <th>Variedad</th>
              <th>Analitos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => (
              <tr key={s.archivo} className={s.codigo_muestra ? styles.lista : undefined}>
                <td className={styles.folio}>{s.campos['N° Solicitud'] || s.archivo}</td>
                <td className={styles.muestra}>
                  {s.codigo_muestra ?? <span className={styles.pendiente}>esperando muestra</span>}
                </td>
                <td className={styles.mono}>{s.campos['Fecha Muestreo'] || '—'}</td>
                <td>{s.campos['Sold To (Nombre)'] || '—'}</td>
                <td>{s.campos['Especie'] || '—'}</td>
                <td>{s.campos['Variedad'] || '—'}</td>
                <td>
                  {s.analitos_solicitados.map((a) => (
                    <span key={a} className={styles.chip}>
                      {a}
                    </span>
                  ))}
                </td>
                <td className={styles.acciones}>
                  <button type="button" className={styles.boton} onClick={() => onVerFicha(s)}>
                    Ver ficha
                  </button>
                  {s.codigo_muestra && (
                    <button type="button" className={styles.boton} onClick={() => onQuitarCruce(s)}>
                      Quitar muestra
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.vacio}>
                  {solicitudes === null
                    ? 'Cargando…'
                    : buscar
                      ? `Sin resultados para “${buscar}”.`
                      : 'No hay solicitudes en este estado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
