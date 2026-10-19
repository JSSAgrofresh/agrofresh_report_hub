import { useMemo, useState } from 'react'
import type { PlantaAsignada } from '../types'
import { agruparPlantas, claveDePlanta } from '../lib/plantas'
import styles from './PlantasAsignadas.module.css'

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Props {
  plantas: PlantaAsignada[]
  onChange: (siguiente: PlantaAsignada[]) => void
}

/** Las plantas de un comercial, ordenadas por Sold To: cada cliente es un bloque plegable con su cantidad, un
 * buscador para encontrar una y un botón para quitar una planta o todo un cliente. */
export function PlantasAsignadas({ plantas, onChange }: Props) {
  const [texto, setTexto] = useState('')
  const grupos = useMemo(() => agruparPlantas(plantas), [plantas])
  const palabras = plano(texto).split(/\s+/).filter(Boolean)
  const visibles = grupos
    .map((g) => ({
      ...g,
      plantas: g.plantas.filter((p) => palabras.every((w) => plano(`${g.cliente} ${p.plantaNombre ?? ''}`).includes(w))),
    }))
    .filter((g) => g.plantas.length > 0)

  if (plantas.length === 0) {
    return <p className={styles.vacio}>Todavía no tiene plantas: sin ellas no vería nada.</p>
  }

  const quitar = (quitadas: PlantaAsignada[]) => {
    const claves = new Set(quitadas.map(claveDePlanta))
    onChange(plantas.filter((p) => !claves.has(claveDePlanta(p))))
  }

  return (
    <div className={styles.caja}>
      <div className={styles.encabezado}>
        <strong>
          {plantas.length} {plantas.length === 1 ? 'planta' : 'plantas'} en {grupos.length} {grupos.length === 1 ? 'cliente' : 'clientes'}
        </strong>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Buscar una planta o un cliente…"
          aria-label="Buscar entre las plantas asignadas"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {visibles.length === 0 && <p className={styles.vacio}>Ninguna planta coincide con la búsqueda.</p>}

      <ul className={styles.grupos} aria-label="Plantas asignadas">
        {visibles.map((g) => (
          <li key={g.cliente}>
            <details open={palabras.length > 0}>
              <summary>
                <span className={styles.cliente}>{g.cliente}</span>
                <span className={styles.cuenta}>{g.plantas.length}</span>
              </summary>
              <div className={styles.cuerpo}>
                <ul className={styles.plantas}>
                  {g.plantas.map((p) => {
                    const nombre = p.plantaNombre ?? 'Todas las plantas de este Sold To'
                    return (
                      <li key={claveDePlanta(p)}>
                        <span>{nombre}</span>
                        <button type="button" aria-label={`Quitar ${g.cliente} · ${nombre}`} onClick={() => quitar([p])}>
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button type="button" className={styles.quitarTodas} onClick={() => quitar(grupos.find((x) => x.cliente === g.cliente)?.plantas ?? [])}>
                  Quitar todo {g.cliente}
                </button>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
