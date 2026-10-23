import { Fragment, useEffect, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ETIQUETA_ORIGEN,
  FILTROS_REGISTRO,
  contarFiltros,
  estadoDe,
  filtrarRegistro,
  leerRegistro,
  problemasDe,
} from '@/features/correoInformes'
import type { FilaRegistro, FiltroRegistro } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import { formatDateCL } from '@/lib/locale'
import styles from './RegistroInformes.module.css'

const LABORATORIOS = ['AgroFresh', 'Quiteca', 'ALS', 'Diagnofruit']
const PERIODOS = [
  { dias: 0, texto: 'Todo el tiempo' },
  { dias: 30, texto: 'Últimos 30 días' },
  { dias: 60, texto: 'Últimos 60 días' },
  { dias: 90, texto: 'Últimos 90 días' },
]

const fecha = (iso: string | null) => (iso ? formatDateCL(iso) : '—')
const fechaHora = (iso: string | null) => (iso ? fechaHoraCorta(iso) : '—')

export interface InicialRegistro {
  q?: string
  filtro?: FiltroRegistro
}

/** Baja lo que se ve como Excel: una columna por dato, para poder cruzarlo o filtrarlo afuera. */
async function descargarExcel(filas: FilaRegistro[]) {
  const XLSX = await import('xlsx')
  const cab = ['Situación', 'OT', 'N° informe', 'Laboratorio', 'Sold To', 'Ship To', 'Especie', 'Tipo aplicación', 'Solicitud emitida', 'Salió al laboratorio',
    'Fecha de muestreo', 'Fecha del informe', 'Llegó', 'Llegó por', 'Cargado a Report', 'Cargado por', 'Cómo se cargó', 'Enviado al cliente', 'Estado', 'Problemas']
  const datos = filas.map((f) => [
    f.situacion, f.ot ?? '', f.informe ?? '', f.laboratorio ?? '', f.sold_to ?? '', f.ship_to ?? '', f.especie ?? '', f.tipo_aplicacion ?? '', f.emitida ?? '', f.enviada_lab ?? '',
    f.fecha_muestreo ?? '', f.fecha_informe ?? '', f.llegada ?? '', f.llegada_por ?? '', f.cargado ?? '', f.cargado_por ?? '', ETIQUETA_ORIGEN[f.origen], f.enviado_cliente ?? '',
    estadoDe(f).texto, problemasDe(f).map((p) => p.texto).join(' | '),
  ])
  const hoja = XLSX.utils.aoa_to_sheet([cab, ...datos])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Informes')
  XLSX.writeFile(libro, 'registro-de-informes.xlsx')
}

function Detalle({ f }: { f: FilaRegistro }) {
  const problemas = f.problemas
  return (
    <div className={styles.detalle}>
      <div className={styles.detalleCol}>
        <h4>Qué pasó con este informe</h4>
        {problemas.length === 0 ? (
          <p className={styles.tenue}>Sin problemas: llegó bien y los datos cuadran con su solicitud.</p>
        ) : (
          <ul className={styles.problemas}>
            {problemas.map((p, i) => (
              <li key={`${p.codigo}-${i}`} className={styles[`g_${p.gravedad}`]}>
                <span className={styles.origenProblema}>{p.origen === 'envio' ? 'Envío' : 'Datos'}</span>
                {p.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className={styles.detalleCol}>
        <h4>Recorrido</h4>
        <div><dt>Solicitud emitida</dt><dd>{fechaHora(f.emitida)}</dd></div>
        <div><dt>Salió al laboratorio</dt><dd>{fechaHora(f.enviada_lab)}</dd></div>
        <div><dt>Informe llegó{f.llegada_por ? ` (${f.llegada_por})` : ''}</dt><dd>{fechaHora(f.llegada)}</dd></div>
        <div><dt>Cargado a Report</dt><dd>{fechaHora(f.cargado)}{f.cargado_por ? ` · ${f.cargado_por}` : ''}</dd></div>
        <div><dt>Enviado al cliente</dt><dd>{fechaHora(f.enviado_cliente)}</dd></div>
        {f.carga_archivo && <div><dt>Archivo de la carga</dt><dd>{f.carga_archivo}</dd></div>}
        {f.envios > 1 && <div><dt>Veces que llegó</dt><dd>{f.envios}</dd></div>}
      </dl>
    </div>
  )
}

/** «Todos los informes»: cada informe con su solicitud, cómo se cargó (automático o a mano), sus fechas y lo que salió mal. */
export function RegistroInformes({ inicial, version }: { inicial?: InicialRegistro; version: number }) {
  const [filas, setFilas] = useState<FilaRegistro[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroRegistro>(inicial?.filtro ?? 'todos')
  const [texto, setTexto] = useState(inicial?.q ?? '')
  const [laboratorio, setLaboratorio] = useState('')
  const [dias, setDias] = useState(0)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ahora] = useState(() => Date.now())

  useEffect(() => {
    let vigente = true
    leerRegistro()
      .then((r) => {
        if (vigente) setFilas(r.filas)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el registro de informes.')
      })
    return () => {
      vigente = false
    }
  }, [version])

  const cuentas = useMemo(() => contarFiltros(filas ?? []), [filas])
  const visibles = useMemo(() => filtrarRegistro(filas ?? [], { filtro, texto, laboratorio, dias, ahora }), [filas, filtro, texto, laboratorio, dias, ahora])

  return (
    <section className={styles.registro} aria-label="Todos los informes">
      <div className={styles.filtros} role="group" aria-label="Qué informes ver">
        {FILTROS_REGISTRO.map((f) => (
          <button key={f.id} type="button" className={styles.chip} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.etiqueta}
            <span className={`${styles.cuenta} ${f.id === 'problemas' && cuentas.problemas > 0 ? styles.cuentaMala : ''}`}>{cuentas[f.id]}</span>
          </button>
        ))}
      </div>

      <div className={styles.barra}>
        <input type="search" className={styles.buscador} placeholder="Buscar por OT, informe, cliente, planta, especie o quién lo cargó…" aria-label="Buscar informes" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className={styles.campo}>
          Laboratorio
          <select value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)}>
            <option value="">Todos</option>
            {LABORATORIOS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className={styles.campo}>
          Período
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.texto}</option>)}
          </select>
        </label>
        <button type="button" className={styles.excel} onClick={() => void descargarExcel(visibles)} disabled={visibles.length === 0}>Descargar Excel</button>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {filas === null && !error ? (
        <Skeleton style={{ height: 260 }} />
      ) : filas && (
        <div className={styles.tablaWrap}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Cliente · planta</th>
                <th>Informe</th>
                <th>Llegó</th>
                <th>Cargado a Report</th>
                <th>Cómo se cargó</th>
                <th>Al cliente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr><td colSpan={8} className={styles.vacio}>{filas.length === 0 ? 'Todavía no hay informes.' : 'Ningún informe coincide con lo que buscas.'}</td></tr>
              ) : (
                visibles.map((f) => {
                  const estado = estadoDe(f)
                  const abierto = abierta === f.id
                  return (
                    <Fragment key={f.id}>
                      <tr className={`${styles.fila} ${abierto ? styles.filaAbierta : ''}`} onClick={() => setAbierta(abierto ? null : f.id)}>
                        <td>
                          <button type="button" className={styles.abrir} aria-expanded={abierto} aria-label={`Ver el detalle de ${f.informe ?? f.ot ?? 'la solicitud'}`}>
                            <b className={styles.codigo}>{f.ot ?? 'Sin OT'}</b>
                            <span>Emitida {fecha(f.emitida)}</span>
                            <span>Al laboratorio {fecha(f.enviada_lab)}</span>
                          </button>
                        </td>
                        <td>
                          <div className={styles.doble}>
                            <b>{f.ship_to ?? '—'}</b>
                            <span>{f.sold_to ?? '—'}</span>
                            <span>{[f.especie, f.tipo_aplicacion].filter(Boolean).join(' · ')}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.doble}>
                            <b className={styles.codigo}>{f.informe ?? '—'}</b>
                            <span>{f.laboratorio ?? '—'}</span>
                            <span>Muestreo {fecha(f.fecha_muestreo)}</span>
                          </div>
                        </td>
                        <td className={styles.fecha}>{fechaHora(f.llegada)}{f.llegada_por && <span className={styles.sub}>{f.llegada_por}</span>}</td>
                        <td className={styles.fecha}>{fechaHora(f.cargado)}{f.cargado_por && <span className={styles.sub}>{f.cargado_por}</span>}</td>
                        <td>{f.situacion === 'cargado' ? <span className={`${styles.origen} ${styles[`o_${f.origen}`]}`}>{ETIQUETA_ORIGEN[f.origen]}</span> : <span className={styles.tenue}>—</span>}</td>
                        <td className={styles.fecha}>{fecha(f.enviado_cliente)}</td>
                        <td><span className={`${styles.estado} ${styles[`e_${estado.tono}`]}`}>{estado.texto}</span></td>
                      </tr>
                      {abierto && (
                        <tr className={styles.filaDetalle}>
                          <td colSpan={8}><Detalle f={f} /></td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.pie}>{visibles.length} {visibles.length === 1 ? 'fila' : 'filas'}. Cada fila es una solicitud con su informe; un clic en una fila muestra su recorrido y lo que salió mal.</p>
    </section>
  )
}
