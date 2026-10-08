import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconoActualizar, IconoAlerta, IconoBuscar } from '@/components/ui/iconosAccion'
import {
  FILTROS_VACIOS,
  LABORATORIOS_GRAFICO,
  NOMBRE_LAB,
  TIPO_ACTIMIST,
  TIPO_LINEA,
  TIPO_RYD,
  contarFiltros,
  filtrarSolicitudes,
  opcionesDeFiltros,
  porGrupoYLaboratorio,
  resumenPorTipo,
  simularSolicitudes,
  tiposDeArea,
  totales,
  useSolicitudesAuditoria,
} from '@/features/auditoriaInterna'
import type { AreaPivote, DimensionGrafico, FiltrosSolicitudes, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { DonaTipoServicio, GraficoGrupoLaboratorio, LeyendaLaboratorios, TarjetaGrafico } from './Graficos'
import { altoGrupoLaboratorio } from './coloresTipo'
import { PanelFiltros } from './PanelFiltros'
import { SelectorArea } from './SelectorArea'
import { ResumenConcretadas } from './ResumenConcretadas'
import { TablaDinamica } from './TablaDinamica'
import styles from './SolicitudesInformesView.module.css'

const nf = new Intl.NumberFormat('es-CL')

const DIMENSIONES: { valor: DimensionGrafico; texto: string; plural: string }[] = [
  { valor: 'cliente', texto: 'Sold To', plural: 'Sold To' },
  { valor: 'planta', texto: 'Ship To', plural: 'Ship To' },
  { valor: 'especie', texto: 'Especie', plural: 'especies' },
  { valor: 'tipo', texto: 'Tipo de servicio', plural: 'tipos de servicio' },
]

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
  const [dimension, setDimension] = useState<DimensionGrafico>('cliente')
  // Filtros propios del gráfico por grupo, encima de los del panel.
  const [filtroGrafico, setFiltroGrafico] = useState({ cliente: '', planta: '', especie: '', tipo: '' })
  const [topClientes, setTopClientes] = useState(10)

  const opciones = useMemo(() => opcionesDeFiltros(todas ?? [], filtros), [todas, filtros])

  // Lo que dejan pasar los filtros: scopea TODO lo de abajo.
  const alcance = useMemo(() => filtrarSolicitudes(todas ?? [], filtros, { estado: true }), [todas, filtros])
  const tot = useMemo(() => totales(alcance), [alcance])
  const actimist = useMemo(() => resumenPorTipo(alcance, TIPO_ACTIMIST), [alcance])
  const lineaProceso = useMemo(() => resumenPorTipo(alcance, TIPO_LINEA), [alcance])
  const ryd = useMemo(() => resumenPorTipo(alcance, TIPO_RYD), [alcance])
  const filtrosGrafico = useMemo(() => ({ ...FILTROS_VACIOS, ...filtroGrafico }), [filtroGrafico])
  const opcionesGrafico = useMemo(() => opcionesDeFiltros(alcance, filtrosGrafico), [alcance, filtrosGrafico])
  const alcanceGrafico = useMemo(() => filtrarSolicitudes(alcance, filtrosGrafico, { estado: true }), [alcance, filtrosGrafico])
  const grupos = useMemo(() => porGrupoYLaboratorio(alcanceGrafico, dimension, topClientes), [alcanceGrafico, dimension, topClientes])
  const totalGrupos = useMemo(() => porGrupoYLaboratorio(alcanceGrafico, dimension, 0).length, [alcanceGrafico, dimension])
  const cambiarFiltroGrafico = (clave: keyof typeof filtroGrafico, valor: string) =>
    setFiltroGrafico((f) => ({ ...f, [clave]: valor, ...(clave === 'cliente' ? { planta: '' } : {}) }))
  const nombreDimension = DIMENSIONES.find((d) => d.valor === dimension)!

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
                titulo={`Análisis e informes por ${nombreDimension.texto}`}
                subtitulo={`Análisis pedidos e informes concretados en los 4 laboratorios · ${grupos.length} de ${nf.format(totalGrupos)} ${nombreDimension.plural}`}
                alto={altoGrupoLaboratorio(grupos.length)}
                leyenda={
                  <>
                    <div className={styles.filtrosGrafico}>
                      <label>
                        Sold To
                        <select className={styles.selectChico} value={filtroGrafico.cliente} onChange={(e) => cambiarFiltroGrafico('cliente', e.target.value)}>
                          <option value="">Todos</option>
                          {opcionesGrafico.clientes.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                      <label>
                        Ship To
                        <select className={styles.selectChico} value={filtroGrafico.planta} onChange={(e) => cambiarFiltroGrafico('planta', e.target.value)}>
                          <option value="">Todos</option>
                          {opcionesGrafico.plantas.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                      <label>
                        Especie
                        <select className={styles.selectChico} value={filtroGrafico.especie} onChange={(e) => cambiarFiltroGrafico('especie', e.target.value)}>
                          <option value="">Todas</option>
                          {opcionesGrafico.especies.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                      <label>
                        Tipo de servicio
                        <select className={styles.selectChico} value={filtroGrafico.tipo} onChange={(e) => cambiarFiltroGrafico('tipo', e.target.value)}>
                          <option value="">Todos</option>
                          {opcionesGrafico.tipos.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                    </div>
                    <LeyendaLaboratorios />
                  </>
                }
                controles={
                  <>
                    <div className={styles.segmentadoChico} role="group" aria-label="Agrupar por">
                      {DIMENSIONES.map((d) => (
                        <button key={d.valor} type="button" aria-pressed={dimension === d.valor} className={dimension === d.valor ? styles.segActivo : ''} onClick={() => setDimension(d.valor)}>
                          {d.texto}
                        </button>
                      ))}
                    </div>
                    <select className={styles.selectChico} aria-label="Cuántos mostrar" value={topClientes} onChange={(e) => setTopClientes(Number(e.target.value))}>
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                      <option value={0}>Todos</option>
                    </select>
                  </>
                }
                tabla={{
                  columnas: [nombreDimension.texto, ...LABORATORIOS_GRAFICO.flatMap((l) => [`${NOMBRE_LAB[l]} · análisis`, `${NOMBRE_LAB[l]} · informes`])],
                  filas: grupos.map((g) => [g.grupo, ...LABORATORIOS_GRAFICO.flatMap((l) => [g.labs[l]?.analisis ?? 0, g.labs[l]?.informes ?? 0])]),
                }}
              >
                {grupos.length > 0 ? (
                  <GraficoGrupoLaboratorio grupos={grupos} />
                ) : (
                  <p className={styles.sinDatosGrafico}>No hay solicitudes con los filtros actuales.</p>
                )}
              </TarjetaGrafico>
            </>
          )}
        </div>
      )}
    </div>
  )
}
