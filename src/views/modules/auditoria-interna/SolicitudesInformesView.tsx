import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconoActualizar, IconoAlerta, IconoBuscar } from '@/components/ui/iconosAccion'
import {
  FILTROS_VACIOS,
  TIPO_ACTIMIST,
  TIPO_LINEA,
  TIPO_RYD,
  contarFiltros,
  filtrarSolicitudes,
  opcionesDeFiltros,
  porClienteYServicio,
  resumenPorTipo,
  simularSolicitudes,
  tipoCorto,
  tiposDeArea,
  topClientesPorServicio,
  totales,
  useSolicitudesAuditoria,
} from '@/features/auditoriaInterna'
import type { AreaPivote, FiltrosSolicitudes, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { DonaTipoServicio, GraficoClienteServicio, LeyendaTipos, TarjetaGrafico } from './Graficos'
import { altoClienteServicio } from './coloresTipo'
import { PanelFiltros } from './PanelFiltros'
import { SelectorArea } from './SelectorArea'
import { ResumenConcretadas } from './ResumenConcretadas'
import { TablaDinamica } from './TablaDinamica'
import styles from './SolicitudesInformesView.module.css'

const nf = new Intl.NumberFormat('es-CL')

type TipoGrafico = 'ambos' | typeof TIPO_ACTIMIST | typeof TIPO_LINEA | typeof TIPO_RYD
const TIPOS_GRAFICO: { valor: TipoGrafico; texto: string }[] = [
  { valor: 'ambos', texto: 'Todos' },
  { valor: TIPO_ACTIMIST, texto: 'Actimist' },
  { valor: TIPO_LINEA, texto: 'Línea de proceso' },
  { valor: TIPO_RYD, texto: 'R&D' },
]
const TODOS_LOS_TIPOS = [TIPO_ACTIMIST, TIPO_LINEA, TIPO_RYD]

export function SolicitudesInformesView() {
  const { user } = useAuth()
  const puedeSimular = user ? esAdminGeneral(user) : false
  const { datos: reales, error, cargando, refrescar: recargarReales } = useSolicitudesAuditoria()
  // Datos inventados que reemplazan a los reales mientras dura la simulación.
  // Solo en memoria: «Actualizar» o salir de la pantalla los descarta.
  const [simulacion, setSimulacion] = useState<SolicitudAuditoria[] | null>(null)
  const simulando = puedeSimular && simulacion !== null
  const todas = simulando ? simulacion : reales
  const refrescar = () => {
    setSimulacion(null)
    recargarReales()
  }

  const [filtros, setFiltros] = useState<FiltrosSolicitudes>({ ...FILTROS_VACIOS })
  // null = ver todo (lo predeterminado)
  const [area, setArea] = useState<AreaPivote | null>(null)
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('ambos')
  const [topClientes, setTopClientes] = useState(10)

  const opciones = useMemo(() => opcionesDeFiltros(todas ?? [], filtros), [todas, filtros])

  // Lo que dejan pasar los filtros: scopea TODO lo de abajo.
  const alcance = useMemo(() => filtrarSolicitudes(todas ?? [], filtros, { estado: true }), [todas, filtros])
  const tot = useMemo(() => totales(alcance), [alcance])
  const actimist = useMemo(() => resumenPorTipo(alcance, TIPO_ACTIMIST), [alcance])
  const lineaProceso = useMemo(() => resumenPorTipo(alcance, TIPO_LINEA), [alcance])
  const ryd = useMemo(() => resumenPorTipo(alcance, TIPO_RYD), [alcance])
  const tiposElegidos = tipoGrafico === 'ambos' ? TODOS_LOS_TIPOS : [tipoGrafico]
  const clientes = useMemo(
    () => topClientesPorServicio(alcance, tipoGrafico === 'ambos' ? TODOS_LOS_TIPOS : [tipoGrafico], topClientes),
    [alcance, tipoGrafico, topClientes],
  )
  const totalClientes = useMemo(() => porClienteYServicio(alcance).length, [alcance])

  const hayFiltros = contarFiltros(filtros) > 0
  const primeraCarga = !todas && !error

  return (
    <div className={styles.pagina}>
      <Header
        title="Solicitudes e informes"
        description="Las solicitudes que emitimos y cuáles ya están concretadas: con su PDF guardado y sus resultados en Report."
        acciones={
          <>
          {puedeSimular && (
            <Button
              variant="secondary"
              onClick={() => setSimulacion(simulando ? null : simularSolicitudes(1000))}
              aria-pressed={simulando}
              title="Muestra 1.000 solicitudes inventadas para probar cómo se ve el panel. No se guarda nada."
            >
              {simulando ? '✕ Salir de la simulación' : '🧪 Simular 1.000 datos'}
            </Button>
          )}
          <Button variant="secondary" onClick={refrescar} disabled={cargando} className={styles.botonActualizar}>
            <IconoActualizar className={cargando ? styles.girando : undefined} width={16} height={16} />
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </Button>
          </>
        }
      />

      {simulando && (
        <div className={styles.avisoSim} role="status">
          🧪 Estás viendo 1.000 solicitudes <b>simuladas</b>. No son reales ni se guardan; «Actualizar» vuelve a los datos de verdad.
        </div>
      )}

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta />
          <span>{error}</span>
          <Button variant="secondary" onClick={refrescar}>Reintentar</Button>
        </div>
      )}

      {primeraCarga && (
        <div className={styles.donas} aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.esqueleto}><Skeleton style={{ width: '50%', height: 14 }} /><Skeleton style={{ width: 150, height: 150, borderRadius: '50%', alignSelf: 'center' }} /></div>
          ))}
        </div>
      )}

      {todas && (
        <div className={cargando && !simulando ? styles.recargando : styles.contenido}>
          <ResumenConcretadas totales={tot} />
          <PanelFiltros filtros={filtros} onChange={(f) => setFiltros(f)} opciones={opciones} datos={todas} />

          {tot.emitidas === 0 ? (
            <div className={styles.vacio}>
              <IconoBuscar width={28} height={28} />
              <h3>{todas.length === 0 ? 'Aún no hay solicitudes emitidas' : 'Nada coincide con los filtros'}</h3>
              <p>{todas.length === 0 ? 'Cuando se emitan solicitudes desde Toma de muestras, aparecerán acá.' : 'Prueba con otra combinación o limpia los filtros.'}</p>
              {hayFiltros && <Button variant="secondary" onClick={() => setFiltros({ ...FILTROS_VACIOS })}>Limpiar filtros</Button>}
            </div>
          ) : (
            <>
              <SelectorArea area={area} onChange={setArea} />
              <div className={styles.panel}>
                <div className={styles.lateral}>
                  {area !== 'rd' && <DonaTipoServicio tipo={TIPO_LINEA} resumen={lineaProceso} />}
                  {area !== 'rd' && <DonaTipoServicio tipo={TIPO_ACTIMIST} resumen={actimist} />}
                  {(area === 'rd' || (area === null && ryd.emitidas > 0)) && <DonaTipoServicio tipo={TIPO_RYD} resumen={ryd} />}
                </div>
                <TablaDinamica solicitudes={alcance} filtros={filtros} tipos={tiposDeArea(area)} />
              </div>

              <TarjetaGrafico
                titulo="Análisis e informes por cliente"
                subtitulo={`Análisis pedidos y informes concretados, por tipo de servicio · ${clientes.length} de ${nf.format(totalClientes)} clientes`}
                alto={altoClienteServicio(clientes.length, tiposElegidos.length)}
                leyenda={<LeyendaTipos tipos={tiposElegidos} />}
                controles={
                  <>
                    <div className={styles.segmentadoChico} role="group" aria-label="Tipo de servicio">
                      {TIPOS_GRAFICO.map((t) => (
                        <button key={t.valor} type="button" aria-pressed={tipoGrafico === t.valor} className={tipoGrafico === t.valor ? styles.segActivo : ''} onClick={() => setTipoGrafico(t.valor)}>
                          {t.texto}
                        </button>
                      ))}
                    </div>
                    <select className={styles.selectChico} aria-label="Cuántos clientes mostrar" value={topClientes} onChange={(e) => setTopClientes(Number(e.target.value))}>
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                      <option value={0}>Todos</option>
                    </select>
                  </>
                }
                tabla={{
                  columnas: ['Cliente', ...tiposElegidos.flatMap((t) => [`${tipoCorto(t)} · análisis`, `${tipoCorto(t)} · informes`])],
                  filas: clientes.map((c) => [c.cliente, ...tiposElegidos.flatMap((t) => [c.tipos[t]?.analisis ?? 0, c.tipos[t]?.informes ?? 0])]),
                }}
              >
                {clientes.length > 0 ? (
                  <GraficoClienteServicio clientes={clientes} tipos={tiposElegidos} />
                ) : (
                  <p className={styles.sinDatosGrafico}>No hay solicitudes de este tipo con los filtros actuales.</p>
                )}
              </TarjetaGrafico>
            </>
          )}
        </div>
      )}
    </div>
  )
}
