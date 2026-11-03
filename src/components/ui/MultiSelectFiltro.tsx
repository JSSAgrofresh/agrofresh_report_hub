import { useState } from 'react'
import { cn } from '@/lib/cn'
import styles from './MultiSelectFiltro.module.css'

interface MultiSelectFiltroProps {
  etiqueta: string
  opciones: string[]
  valores: string[]
  onChange: (valores: string[]) => void
  colorDe?: (opcion: string) => string
  /** Opcional: un número al lado de cada opción (ej. cuántos registros trae). */
  conteoDe?: (opcion: string) => number | undefined
  /** Opcional: cómo se escribe cada opción (el valor guardado no cambia; ej. 9 → «Septiembre»). */
  formatear?: (opcion: string) => string
  /**
   * El estado normal es «todo marcado»: al tocar una opción cuando están todas marcadas queda SOLO esa (y se pueden ir
   * marcando más), y «Limpiar» vuelve a marcar todas. Sin esto, el estado normal es «nada marcado = todos».
   */
  todosPorDefecto?: boolean
}

/** Sin tildes ni mayúsculas, para buscar. */
const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Desde cuántas opciones aparece el cuadro de búsqueda. */
const OPCIONES_PARA_BUSCAR = 8

export function MultiSelectFiltro({ etiqueta, opciones, valores, onChange, colorDe, conteoDe, formatear = (v) => v, todosPorDefecto = false }: MultiSelectFiltroProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const todosMarcados = todosPorDefecto && opciones.length > 0 && opciones.every((o) => valores.includes(o))

  function alternar(o: string) {
    if (todosMarcados) {
      onChange([o])
      return
    }
    onChange(valores.includes(o) ? valores.filter((v) => v !== o) : [...valores, o])
  }

  function limpiar() {
    onChange(todosPorDefecto ? [...opciones] : [])
  }

  const hayAlgoQueLimpiar = todosPorDefecto ? !todosMarcados : valores.length > 0
  const conBuscador = opciones.length > OPCIONES_PARA_BUSCAR
  const visibles = busqueda.trim() ? opciones.filter((o) => plano(formatear(o)).includes(plano(busqueda.trim()))) : opciones

  const textoBoton = todosMarcados
    ? 'Todos'
    : valores.length === 0
      ? 'Todos'
      : valores.length === 1
        ? formatear(valores[0])
        : `${valores.length} seleccionados`

  return (
    <div className={styles.contenedor}>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <button
        type="button"
        className={styles.boton}
        onClick={() => {
          setAbierto((v) => !v)
          setBusqueda('')
        }}
      >
        <span className={cn(styles.botonTexto, (valores.length === 0 || todosMarcados) && styles.botonTextoVacio)}>{textoBoton}</span>
        <span className={styles.flecha}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <>
          <div
            className={styles.fondo}
            onClick={() => {
              setAbierto(false)
              setBusqueda('')
            }}
          />
          <div className={styles.lista}>
            <div className={styles.listaCabecera}>
              <span>{valores.length} de {opciones.length} seleccionados</span>
              {hayAlgoQueLimpiar && (
                <button type="button" className={styles.limpiar} onClick={limpiar}>
                  Limpiar
                </button>
              )}
            </div>
            {conBuscador && (
              <input
                type="search"
                className={styles.buscador}
                placeholder="Buscar…"
                aria-label={`Buscar en ${etiqueta}`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            )}
            {opciones.length === 0 || visibles.length === 0 ? (
              <p className={styles.sinResultados}>Sin opciones</p>
            ) : (
              visibles.map((o) => (
                <label key={o} className={styles.opcion}>
                  <input type="checkbox" checked={valores.includes(o)} onChange={() => alternar(o)} />
                  {colorDe && <span className={styles.puntoColor} style={{ background: colorDe(o) }} />}
                  <span>{formatear(o)}</span>
                  {conteoDe && conteoDe(o) !== undefined && (
                    <span className={styles.conteo}>{conteoDe(o)?.toLocaleString('es-CL')}</span>
                  )}
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
