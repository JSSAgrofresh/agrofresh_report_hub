import { useMemo, useState } from 'react'
import type { CategoriaGC, RegionGC } from '@/features/emitir'
import styles from './VisorGC.module.css'

/**
 * El archivo del GC tal como salió del equipo, con cada parte de un color y
 * la hoja del Excel a la que va a parar.
 *
 * Es lo primero que se ve después de subir el reporte. Sirve para dos cosas:
 * que quien revisa entienda de dónde sale cada número —el archivo son ~9.500
 * líneas y los resultados son unas 600— y que se note al tiro si el equipo
 * escribió algo que el sistema no esperaba: una sección desconocida queda sin
 * color de destino.
 *
 * Se dibuja un bloque por región y no una fila por línea: son ~190 nodos en
 * vez de ~9.500, que es la diferencia entre que la vista abra al tiro o se
 * arrastre. El texto va en un <pre>, así que las columnas del reporte quedan
 * alineadas igual que en el papel.
 */
export function VisorGC({
  texto,
  regiones,
  categorias,
}: {
  texto: string
  regiones: RegionGC[]
  categorias: CategoriaGC[]
}) {
  const [soloCategoria, setSoloCategoria] = useState<string | null>(null)

  const lineas = useMemo(() => texto.split('\n'), [texto])
  const cuantasPorCategoria = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const r of regiones) {
      cuenta.set(r.categoria, (cuenta.get(r.categoria) ?? 0) + (r.fin - r.inicio + 1))
    }
    return cuenta
  }, [regiones])

  const conLineas = categorias.filter((c) => (cuantasPorCategoria.get(c.id) ?? 0) > 0)

  return (
    <div className={styles.visor}>
      <div className={styles.leyenda}>
        {conLineas.map((c) => (
          <button
            key={c.id}
            type="button"
            data-categoria={c.id}
            aria-pressed={soloCategoria === c.id}
            className={
              soloCategoria && soloCategoria !== c.id ? styles.chipApagado : styles.chip
            }
            onClick={() => setSoloCategoria(soloCategoria === c.id ? null : c.id)}
            title={c.hoja ? `Va a la hoja «${c.hoja}» del Excel` : 'El sistema no ocupa esta parte'}
          >
            <span className={styles.muestra} />
            <span className={styles.nombre}>{c.nombre}</span>
            <span className={styles.destino}>{c.hoja ?? 'no se ocupa'}</span>
            <span className={styles.cuantas}>
              {(cuantasPorCategoria.get(c.id) ?? 0).toLocaleString('es-CL')}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.ayuda}>
        Cada color es una parte del reporte y la hoja del Excel a la que va a parar. Haz clic en un
        color para ver solo esa parte.
      </p>

      <div className={styles.archivo}>
        {regiones
          .filter((r) => !soloCategoria || r.categoria === soloCategoria)
          .map((r) => {
            const categoria = categorias.find((c) => c.id === r.categoria)
            return (
              <div key={r.inicio} className={styles.region} data-categoria={r.categoria}>
                <div className={styles.etiqueta}>
                  <strong>{categoria?.nombre ?? r.categoria}</strong>
                  <span>{categoria?.hoja ? `→ hoja «${categoria.hoja}»` : '→ no se ocupa'}</span>
                </div>
                <div className={styles.tramo}>
                  <pre className={styles.numeros} aria-hidden="true">
                    {rango(r.inicio, r.fin).join('\n')}
                  </pre>
                  <pre className={styles.texto}>
                    {lineas.slice(r.inicio - 1, r.fin).join('\n')}
                  </pre>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
}
