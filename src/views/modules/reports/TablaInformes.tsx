import { useMemo, useState, type CSSProperties } from 'react'
import {
  ORDEN_INICIAL,
  TAMANOS_PAGINA,
  alternarOrden,
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
import { useAnchoMaximo } from '@/hooks/useAnchoMaximo'
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
 * Tabla por informe de ALS y Diagnofruit: la fecha, el informe y debajo una fila por analito con su resultado, unidad y estado. Se ordena por
 * cualquier columna, se busca por N°, zona o fecha, se pagina, resume cuántos informes tuvieron detección y se descarga
 * en CSV (lo que se ve, ordenado y filtrado, no solo la página).
 */
export function TablaInformes({ modelo, nota, columnaDetalle, archivo }: Props) {
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [texto, setTexto] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState<number>(25)
  // En un teléfono la tabla no cabe: cada informe pasa a ser una tarjeta.
  const angosto = useAnchoMaximo(640)

  const conDetalle = modelo.informes.some((i) => i.detalle)
  const filtrados = useMemo(() => filtrarInformes(modelo.informes, texto), [modelo.informes, texto])
  const ordenados = useMemo(() => ordenarInformes(filtrados, orden), [filtrados, orden])
  const pag = paginar(ordenados, pagina, tamano)
  const resumen = useMemo(() => resumenPorAnalito(filtrados, modelo.analitos), [filtrados, modelo.analitos])
  const conDeteccion = filtrados.filter((i) => detectadosDe(i) > 0).length
  const columnas = 2 + (conDetalle ? 1 : 0) + 4

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
            placeholder="Buscar informe, sucursal, analito…"
            aria-label="Buscar informe"
            onChange={(e) => {
              setTexto(e.target.value)
              setPagina(1)
            }}
          />
        </label>
        <span className={styles.espacio} />
        {angosto && (
          <label className={styles.control}>
            Ordenar por
            <select
              value={`${orden.col}|${orden.dir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split('|')
                setOrden({ col, dir: dir as Orden['dir'] })
                setPagina(1)
              }}
            >
              <option value="fecha|desc">Fecha: más reciente</option>
              <option value="fecha|asc">Fecha: más antigua</option>
              <option value="nro|asc">N° de informe</option>
              <option value="estado|desc">Más detectados</option>
            </select>
          </label>
        )}
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

      {angosto ? (
        <div className={styles.tarjetas}>
          {pag.filas.length === 0 && <p className={styles.vacioTarjetas}>Ningún informe calza con la búsqueda.</p>}
          {pag.filas.map((inf, i) => {
            const lineas = modelo.analitos.filter((a) => inf.porAnalito[a.codigo])
            return (
              <article key={`${inf.nro}-${i}`} className={styles.tarjetaInforme}>
                <header>
                  <span className={styles.fecha}>
                    {inf.fechaTxt}
                    {inf.fecha && <small>{modelo.dias.find((d) => d.fecha === inf.fecha)?.diaSemana}</small>}
                  </span>
                  <span className={styles.informe}>{inf.nro}</span>
                </header>
                {conDetalle && inf.detalle && (
                  <p className={styles.detalleTarjeta}>
                    {columnaDetalle}: <b>{inf.detalle}</b>
                  </p>
                )}
                <ul>
                  {lineas.map((a) => {
                    const r = inf.porAnalito[a.codigo]
                    return (
                      <li key={a.codigo}>
                        <span className={styles.nombreAnalito}>
                          <i className={styles.punto} style={{ background: a.color.fill }} />
                          {a.nombre}
                        </span>
                        <span className={styles.valorTarjeta}>
                          {r.detectado ? (
                            <span className={styles.chipSi} style={{ '--c': a.color.fill } as CSSProperties}>{r.texto}</span>
                          ) : (
                            <span className={styles.chipNo}>{r.texto}</span>
                          )}
                          <small>{a.unidad}</small>
                        </span>
                        {r.detectado ? <span className={styles.estadoSi}>Detectado</span> : <span className={styles.estadoNo}>No detectado</span>}
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
        </div>
      ) : (
      <div className={styles.caja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              {encabezado('fecha', 'Fecha de muestreo')}
              {encabezado('nro', 'N° de informe')}
              {conDetalle && encabezado('detalle', columnaDetalle)}
              <th><span className={styles.cabSimple}>Analito</span></th>
              <th><span className={styles.cabSimple}>Resultado</span></th>
              <th><span className={styles.cabSimple}>Unidad</span></th>
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
              const lineas = modelo.analitos.filter((a) => inf.porAnalito[a.codigo])
              const filas = lineas.length ? lineas : [null]
              const primeraDelDia = i === 0 || pag.filas[i - 1].fecha !== inf.fecha
              // Cuántas filas ocupa el día: las de este informe y las de los siguientes con la misma fecha.
              let filasDelDia = 0
              if (primeraDelDia) {
                for (let j = i; j < pag.filas.length && pag.filas[j].fecha === inf.fecha; j++) {
                  filasDelDia += Math.max(1, modelo.analitos.filter((a) => pag.filas[j].porAnalito[a.codigo]).length)
                }
              }
              return filas.map((a, k) => {
                const r = a ? inf.porAnalito[a.codigo] : null
                const ultima = k === filas.length - 1
                return (
                  <tr key={`${inf.nro}-${i}-${a?.codigo ?? 'sin'}`} className={ultima ? styles.finInforme : undefined}>
                    {k === 0 && primeraDelDia && (
                      <td className={`${styles.fecha} ${styles.grupo}`} rowSpan={filasDelDia}>
                        {inf.fechaTxt}
                        {inf.fecha && <small>{modelo.dias.find((d) => d.fecha === inf.fecha)?.diaSemana}</small>}
                      </td>
                    )}
                    {k === 0 && (
                      <td className={styles.grupo} rowSpan={filas.length}>
                        <span className={styles.informe}>{inf.nro}</span>
                      </td>
                    )}
                    {conDetalle && k === 0 && (
                      <td className={`${styles.detalle} ${styles.grupo}`} rowSpan={filas.length}>{inf.detalle || '—'}</td>
                    )}
                    <td>
                      {a ? (
                        <span className={styles.nombreAnalito}>
                          <i className={styles.punto} style={{ background: a.color.fill }} />
                          {a.nombre}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {!r ? (
                        '—'
                      ) : r.detectado ? (
                        <span className={styles.chipSi} style={{ '--c': a!.color.fill } as CSSProperties}>
                          {r.texto}
                        </span>
                      ) : (
                        <span className={styles.chipNo}>{r.texto}</span>
                      )}
                    </td>
                    <td className={styles.unidadCelda}>{a?.unidad ?? ''}</td>
                    <td>
                      {!r ? (
                        '—'
                      ) : r.detectado ? (
                        <span className={styles.estadoSi}>Detectado</span>
                      ) : (
                        <span className={styles.estadoNo}>No detectado</span>
                      )}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
      )}

      {filtrados.length > 0 && (
        <div className={styles.resumen}>
          <b>Informes con el analito detectado</b>
          {modelo.analitos.map((a, k) => (
            <span key={a.codigo}>
              <i className={styles.punto} style={{ background: a.color.fill }} />
              {a.nombre} <b>{resumen[k].detectados}</b> de {resumen[k].total}
            </span>
          ))}
          <span>
            Con algún analito detectado <b>{conDeteccion}</b> de {filtrados.length}
          </span>
        </div>
      )}

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
