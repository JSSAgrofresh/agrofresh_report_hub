import { useMemo, useState, type CSSProperties } from 'react'
import {
  ORDEN_INICIAL,
  TAMANOS_PAGINA,
  alternarOrden,
  analitosDe,
  columnaAnalito,
  csvDeInformes,
  detectadosDe,
  filtrarInformes,
  ordenarInformes,
  paginar,
  resumenPorAnalito,
  type Orden,
} from '@/features/reportes/lib/tablaInformes'
import type { ModeloLinea } from '@/features/reportes/lib/lineaTiempoInformes'
import { Button } from '@/components/ui/Button'
import styles from './TablaInformes.module.css'

interface Props {
  modelo: ModeloLinea
  /** La nota al pie sobre qué significa «no se detectó» en este laboratorio. */
  nota: string
  /** Encabezado de la columna de zona de muestreo; solo sale si algún informe la trae. */
  columnaDetalle: string
  /** Para el nombre del archivo que se descarga («als», «diagnofruit»). */
  archivo: string
}

function descargarCsv(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Tabla por informe de ALS y Diagnofruit: un informe por fila y una columna por analito, con su unidad. Se ordena por
 * cualquier columna, se busca por N°, zona o fecha, se pagina, resume cuántos informes tuvieron detección y se descarga
 * en CSV (lo que se ve, ordenado y filtrado, no solo la página).
 */
export function TablaInformes({ modelo, nota, columnaDetalle, archivo }: Props) {
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [texto, setTexto] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState<number>(25)

  const conDetalle = modelo.informes.some((i) => i.detalle)
  const filtrados = useMemo(() => filtrarInformes(modelo.informes, texto), [modelo.informes, texto])
  const ordenados = useMemo(() => ordenarInformes(filtrados, orden), [filtrados, orden])
  const pag = paginar(ordenados, pagina, tamano)
  const resumen = useMemo(() => resumenPorAnalito(filtrados, modelo.analitos), [filtrados, modelo.analitos])
  const conDeteccion = filtrados.filter((i) => detectadosDe(i) > 0).length
  const columnas = 2 + (conDetalle ? 1 : 0) + modelo.analitos.length + 1

  function ordenarPor(col: string) {
    setOrden((o) => alternarOrden(o, col))
    setPagina(1)
  }

  /** Un encabezado que ordena. Es una función y no un componente para que el botón no se vuelva a montar (y pierda el foco) al ordenar. */
  const encabezado = (col: string, contenido: React.ReactNode) => {
    const activo = orden.col === col
    return (
      <th key={col} className={activo ? styles.activo : undefined} aria-sort={activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={styles.orden} onClick={() => ordenarPor(col)}>
          {contenido}
          <span className={styles.flecha} aria-hidden="true">{activo ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    )
  }

  return (
    <>
      <div className={styles.barra}>
        <label className={styles.buscador}>
          <svg className={styles.lupa} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={texto}
            placeholder="Buscar por N° de informe, zona o fecha"
            aria-label="Buscar informe"
            onChange={(e) => {
              setTexto(e.target.value)
              setPagina(1)
            }}
          />
        </label>
        <span className={styles.espacio} />
        <label className={styles.control}>
          Filas por página
          <select
            value={tamano}
            onChange={(e) => {
              setTamano(Number(e.target.value))
              setPagina(1)
            }}
          >
            {TAMANOS_PAGINA.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={!ordenados.length}
          onClick={() =>
            descargarCsv(
              `informes-${archivo}-${new Date().toISOString().slice(0, 10)}.csv`,
              csvDeInformes(ordenados, modelo.analitos, conDetalle ? columnaDetalle : null),
            )
          }
        >
          Descargar CSV
        </Button>
      </div>

      <div className={styles.caja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              {encabezado('fecha', 'Fecha de muestreo')}
              {encabezado('nro', 'N° de informe')}
              {conDetalle && encabezado('detalle', columnaDetalle)}
              {modelo.analitos.map((a) =>
                encabezado(
                  columnaAnalito(a.codigo),
                  <span className={styles.cabAnalito}>
                    <b>
                      <i className={styles.punto} style={{ background: a.color.fill }} />
                      {a.nombre.toUpperCase()}
                    </b>
                    <span>{a.unidad}</span>
                  </span>,
                ),
              )}
              {encabezado('estado', 'Estado')}
            </tr>
          </thead>
          <tbody>
            {pag.filas.length === 0 && (
              <tr className={styles.vacio}>
                <td colSpan={columnas}>Ningún informe calza con la búsqueda.</td>
              </tr>
            )}
            {pag.filas.map((inf, i) => {
              const hay = detectadosDe(inf)
              return (
                <tr key={`${inf.nro}-${i}`}>
                  <td className={styles.fecha}>
                    {inf.fechaTxt}
                    {inf.fecha && <small>{modelo.dias.find((d) => d.fecha === inf.fecha)?.diaSemana}</small>}
                  </td>
                  <td>
                    <span className={styles.informe}>{inf.nro}</span>
                  </td>
                  {conDetalle && <td className={styles.detalle}>{inf.detalle || '—'}</td>}
                  {modelo.analitos.map((a) => {
                    const r = inf.porAnalito[a.codigo]
                    return (
                      <td key={a.codigo}>
                        {!r ? (
                          '—'
                        ) : r.detectado ? (
                          <span className={styles.chipSi} style={{ '--c': a.color.fill } as CSSProperties}>
                            {r.texto}
                          </span>
                        ) : (
                          <span className={styles.chipNo}>{r.texto}</span>
                        )}
                      </td>
                    )
                  })}
                  <td>
                    {hay > 0 ? (
                      <span className={styles.estadoSi} title={`${hay} de ${analitosDe(inf)} analitos detectados`}>Detectó · {hay}/{analitosDe(inf)}</span>
                    ) : (
                      <span className={styles.estadoNo}>No detectó</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={conDetalle ? 3 : 2}>Informes con detección por analito</td>
                {resumen.map((r) => (
                  <td key={r.codigo}>
                    <b>{r.detectados}</b> de {r.total}
                  </td>
                ))}
                <td>
                  <b>{conDeteccion}</b> de {filtrados.length}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className={styles.pie}>
        <span>
          {pag.desde === 0 ? 'Sin informes' : `Mostrando ${pag.desde}–${pag.hasta} de ${ordenados.length} informe${ordenados.length === 1 ? '' : 's'}`}
          {texto.trim() && modelo.informes.length !== ordenados.length ? ` (de ${modelo.informes.length})` : ''}
        </span>
        {pag.paginas > 1 && (
          <span className={styles.paginas}>
            <button type="button" disabled={pag.pagina <= 1} onClick={() => setPagina(pag.pagina - 1)}>← Anterior</button>
            Página {pag.pagina} de {pag.paginas}
            <button type="button" disabled={pag.pagina >= pag.paginas} onClick={() => setPagina(pag.pagina + 1)}>Siguiente →</button>
          </span>
        )}
      </div>
      <p className={styles.nota}>{nota}</p>
    </>
  )
}
