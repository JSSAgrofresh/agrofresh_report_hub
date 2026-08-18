import { useState } from 'react'
import { cn } from '@/lib/cn'
import styles from './MultiSelectFiltro.module.css'

interface MultiSelectFiltroProps {
  etiqueta: string
  opciones: string[]
  valores: string[]
  onChange: (valores: string[]) => void
  colorDe?: (opcion: string) => string
}

export function MultiSelectFiltro({ etiqueta, opciones, valores, onChange, colorDe }: MultiSelectFiltroProps) {
  const [abierto, setAbierto] = useState(false)

  function alternar(o: string) {
    onChange(valores.includes(o) ? valores.filter((v) => v !== o) : [...valores, o])
  }

  const textoBoton =
    valores.length === 0 ? 'Todos' : valores.length === 1 ? valores[0] : `${valores.length} seleccionados`

  return (
    <div className={styles.contenedor}>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <button type="button" className={styles.boton} onClick={() => setAbierto((v) => !v)}>
        <span className={cn(styles.botonTexto, valores.length === 0 && styles.botonTextoVacio)}>{textoBoton}</span>
        <span className={styles.flecha}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <>
          <div className={styles.fondo} onClick={() => setAbierto(false)} />
          <div className={styles.lista}>
            <div className={styles.listaCabecera}>
              <span>{valores.length} de {opciones.length} seleccionados</span>
              {valores.length > 0 && (
                <button type="button" className={styles.limpiar} onClick={() => onChange([])}>
                  Limpiar
                </button>
              )}
            </div>
            {opciones.length === 0 ? (
              <p className={styles.sinResultados}>Sin opciones</p>
            ) : (
              opciones.map((o) => (
                <label key={o} className={styles.opcion}>
                  <input type="checkbox" checked={valores.includes(o)} onChange={() => alternar(o)} />
                  {colorDe && <span className={styles.puntoColor} style={{ background: colorDe(o) }} />}
                  <span>{o}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
