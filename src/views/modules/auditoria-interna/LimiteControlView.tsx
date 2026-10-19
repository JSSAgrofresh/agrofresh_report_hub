import { useState } from 'react'
import { ReporteView } from '@/views/modules/reports/ReporteView'
import { AuditoriaHero } from './AuditoriaHero'
import styles from './LimiteControlView.module.css'

type Modo = 'residuales' | 'control'

const MODOS: { valor: Modo; texto: string }[] = [
  { valor: 'residuales', texto: 'Límites residuales' },
  { valor: 'control', texto: 'Límites de control' },
]

/** La vista de límites es un gráfico interno: vive solo acá. Es el mismo componente de Report, con los
 * mismos filtros y gráficos, en dos modos: **Límites residuales** (franjas fijas de la tabla del laboratorio,
 * por especie, y el recuadro de informes fuera de rango) y **Límites de control** (promedio ± N desviaciones,
 * como siempre). El modo se elige arriba de los filtros. */
export function LimiteControlView() {
  const [modo, setModo] = useState<Modo>('residuales')
  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        tono="azul"
        etiqueta="Panel de control interno"
        titulo="Vista de límites"
        descripcion="Compara los resultados de cada informe contra los límites residuales del laboratorio o contra los límites de control calculados con los propios datos."
      />
      <ReporteView
        vistaControl={modo === 'control'}
        limitesTabla={modo === 'residuales'}
        filtrosMultiples
        sinEncabezado
        selectorModo={
          <div className={styles.selector} role="group" aria-label="Tipo de límite">
            {MODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                aria-pressed={modo === m.valor}
                className={modo === m.valor ? styles.activo : ''}
                onClick={() => setModo(m.valor)}
              >
                {m.texto}
              </button>
            ))}
          </div>
        }
      />
    </div>
  )
}
