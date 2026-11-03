import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { analizarPlanEntregables, confirmarPlanEntregables, leerPlanEntregables } from '@/features/planEntregables'
import type { ResumenCargaPlan, RespuestaPlan } from '@/features/planEntregables'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './PlanEntregablesPanel.module.css'

const nf = new Intl.NumberFormat('es-CL')
const ETIQUETA: Record<string, string> = { residuales: 'Residuales', fsma: 'FSMA', fito: 'FITO', otro: 'Otros (no se muestran)' }
const sinTitulo = (n: number) => (n === 1 ? 'fila' : 'filas')

/**
 * Administración General → Plan de entregables.
 *
 * Sube el Excel final de entregables (hoja «Base»: Sold To con su código SAP, planta, servicio, línea, semana y las DOS cantidades,
 * Original y Propuesta; también se acepta el formato anterior con TOTAL). Primero muestra qué cargaría, sin escribir nada; al
 * confirmar reemplaza el plan de la temporada. Un Sold To que no existe en Listados no se carga: se avisa para corregirlo.
 * Alimenta las columnas «Entregable original» y «Entregable propuesto» del Panel de control interno → «Análisis por cliente».
 */
export function PlanEntregablesPanel() {
  const entrada = useRef<HTMLInputElement>(null)
  const [actual, setActual] = useState<RespuestaPlan | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<ResumenCargaPlan | null>(null)
  const [hecho, setHecho] = useState<ResumenCargaPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    leerPlanEntregables().then(setActual).catch(() => undefined)
  }, [hecho])

  async function elegir(f: File) {
    setError(null)
    setHecho(null)
    setVista(null)
    setArchivo(f)
    setTrabajando(true)
    try {
      setVista(await analizarPlanEntregables(f))
    } catch (e) {
      setArchivo(null)
      setError(e instanceof Error && e.message ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setTrabajando(false)
    }
  }

  async function cargar() {
    if (!archivo) return
    setTrabajando(true)
    setError(null)
    try {
      setHecho(await confirmarPlanEntregables(archivo))
      setVista(null)
      setArchivo(null)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar el plan.')
    } finally {
      setTrabajando(false)
    }
  }

  const resumen = hecho ?? vista
  return (
    <section className={styles.panel} aria-label="Plan de entregables">
      <div className={styles.tarjeta}>
        <h2 className={styles.titulo}>Plan de entregables de la temporada</h2>
        <p className={styles.texto}>
          Sube el Excel final de entregables (hoja «Base»: código SAP del Sold To, planta, servicio, línea, semana y las cantidades
          Original y Propuesta). Las dos se guardan y se muestran. Antes de cargar se ve qué entraría. Cargar reemplaza el plan anterior.
          Los Sold To que no existan en Listados no se cargan; las filas repetidas se fusionan y las que no traen ninguna cantidad se saltan.
          Se usa en el Panel de control interno, en «Análisis por cliente», agrupando por Sold To.
        </p>
        {actual?.migracion_pendiente && (
          <p className={styles.aviso} role="status">Falta correr la migración 0062 en el servidor para poder cargar el plan.</p>
        )}
        {actual && !actual.migracion_pendiente && (
          <p className={styles.pie}>
            {actual.clientes.length === 0
              ? 'Todavía no hay un plan cargado.'
              : `Plan cargado: ${nf.format(actual.clientes.length)} Sold To${actual.cargado_en ? `, ${fechaHora(actual.cargado_en)}` : ''}.`}
          </p>
        )}
        <div className={styles.acciones}>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx"
            className={styles.oculto}
            aria-label="Excel del plan de entregables"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void elegir(f)
            }}
          />
          <Button variant="secondary" onClick={() => entrada.current?.click()} disabled={trabajando}>
            {archivo ? 'Elegir otro Excel' : 'Elegir Excel'}
          </Button>
          {archivo && vista && (
            <Button onClick={() => void cargar()} disabled={trabajando || vista.filas_validas === 0}>
              {trabajando ? 'Cargando…' : `Cargar ${nf.format(vista.filas_validas)} filas`}
            </Button>
          )}
          {archivo && <span className={styles.pie}>{archivo.name}</span>}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {hecho && <p className={styles.ok} role="status">Plan cargado: {nf.format(hecho.filas_validas)} filas de {nf.format(hecho.clientes)} Sold To.</p>}

        {resumen && (
          <>
            <ul className={styles.cifras}>
              <li><b>{nf.format(resumen.clientes)}</b><span>Sold To</span></li>
              {resumen.plantas !== undefined && <li><b>{nf.format(resumen.plantas)}</b><span>plantas</span></li>}
              <li><b>{nf.format(resumen.filas_validas)}</b><span>filas de {nf.format(resumen.filas_leidas)} leídas</span></li>
              {Object.entries(resumen.por_servicio).map(([k, n]) => (
                <li key={k}>
                  <b>{nf.format(n.original)} / {nf.format(n.propuesta)}</b>
                  <span>{ETIQUETA[k] ?? k} (original / propuesta)</span>
                </li>
              ))}
            </ul>
            {((resumen.filas_fusionadas ?? 0) > 0 || (resumen.filas_sin_cantidad ?? 0) > 0) && (
              <p className={styles.pie}>
                {(resumen.filas_fusionadas ?? 0) > 0 && `${nf.format(resumen.filas_fusionadas ?? 0)} ${sinTitulo(resumen.filas_fusionadas ?? 0)} repetidas se fusionaron (no cuentan doble). `}
                {(resumen.filas_sin_cantidad ?? 0) > 0 && `${nf.format(resumen.filas_sin_cantidad ?? 0)} ${sinTitulo(resumen.filas_sin_cantidad ?? 0)} sin Original ni Propuesta se saltaron.`}
              </p>
            )}
            {resumen.descartados.length > 0 && (
              <>
                <p className={styles.aviso} role="status">
                  {resumen.descartados.length} Sold To no se cargan. Corrige el nombre en el Excel o crea el Sold To en Listados y vuelve a subirlo.
                </p>
                <ul className={styles.descartados}>
                  {resumen.descartados.map((d) => (
                    <li key={d.sold_to}><b>{d.sold_to}</b> · {d.motivo} ({d.filas} {d.filas === 1 ? 'fila' : 'filas'})</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
