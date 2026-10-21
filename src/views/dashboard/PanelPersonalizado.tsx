import { useState } from 'react'
import type { ReactNode } from 'react'
import { Header } from '@/components/layout/Header'
import { AREAS } from '@/constants/areas'
import type { AreaId } from '@/constants/areas'
import { MODULOS } from '@/constants/modules'
import { ModuloCard, useActividadDashboard, usePanelCliente, useSeriesDashboard } from '@/features/dashboard'
import type { ActividadDashboard, PanelCliente, SeriesDashboard } from '@/features/dashboard'
import { widgetPorId } from '@/features/panelInicio'
import type { Pieza } from '@/features/panelInicio'
import { modulosPermitidos } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import { InformesAccutabCliente } from '@/views/modules/reports/InformesAccutabCliente'
import { ReporteView } from '@/views/modules/reports/ReporteView'
import { PortalHero } from './PortalHero'
import { AccesosCliente } from './AccesosCliente'
import { InformesPorMes, SaludoCliente, UltimoInformeCliente } from './graficosCliente'
import { CarruselNovedades, GraficoActividad, GraficoBarras, GraficoDona, HeroBienvenida, TiraVerificaciones, TituloArea } from './graficos'
import { ConverterPanel, EnviosFallidosPanel, KpiCard, SolicitudesPanel, TracePanel, UsuariosActivos, VerificacionesPanel } from './bloquesAdmin'
import styles from './PanelPersonalizado.module.css'

/** Los widgets de cliente que leen `/reportes/panel-cliente`. */
const CON_DATOS_CLIENTE = ['cliente:saludo', 'cliente:ultimo_informe', 'cliente:informes_mes', 'cliente:especies', 'cliente:analitos']

interface Contexto {
  usuario: Usuario
  actividad: ActividadDashboard | null
  cargando: boolean
  series: SeriesDashboard | null
  cargandoSeries: boolean
  panelCliente: PanelCliente | null
  cargandoCliente: boolean
  especie: string | null
  setEspecie: (e: string | null) => void
}

function dibujar(id: string, c: Contexto): ReactNode {
  const m = c.actividad?.metricas
  const permitidos = modulosPermitidos(c.usuario).map((x) => x.id)
  const def = widgetPorId(id)
  if (def?.moduloId) {
    const modulo = MODULOS.find((x) => x.id === def.moduloId)
    return modulo && permitidos.includes(modulo.id) ? <ModuloCard modulo={modulo} /> : null
  }
  if (id.startsWith('titulo:')) {
    const area = id.slice('titulo:'.length)
    return <TituloArea area={area === 'general' ? 'general' : (area as AreaId)} />
  }
  const dias = c.series?.por_dia.map((d) => d.n)
  switch (id) {
    case 'hero:bienvenida':
      return <HeroBienvenida nombre={c.usuario.nombre} actividad={c.actividad} cargando={c.cargando} />
    case 'carrusel:novedades':
      return <CarruselNovedades actividad={c.actividad} cargando={c.cargando} />
    case 'grafico:actividad':
      return <GraficoActividad datos={c.series?.por_dia ?? []} cargando={c.cargandoSeries} />
    case 'grafico:laboratorios':
      return <GraficoBarras titulo="Por laboratorio" sub="últimos 90 días" datos={c.series?.por_laboratorio ?? []} cargando={c.cargandoSeries} />
    case 'grafico:especies':
      return <GraficoDona titulo="Por especie" sub="últimos 90 días" unidad="solicitudes" datos={c.series?.por_especie ?? []} cargando={c.cargandoSeries} />
    case 'grafico:verificaciones':
      return <TiraVerificaciones registros={c.series?.verificaciones ?? []} cargando={c.cargandoSeries} />
    case 'kpi:solicitudes':
      return <KpiCard valor={c.cargando ? '…' : (m?.total_solicitudes ?? 0).toLocaleString('es-CL')} etiqueta="Solicitudes en la base" sub="registros vigentes" spark={dias} />
    case 'kpi:semana':
      return <KpiCard valor={c.cargando ? '…' : (m?.esta_semana ?? 0)} etiqueta="Ingresadas esta semana" sub="últimos 7 días" destaca={!c.cargando && (m?.esta_semana ?? 0) > 0} spark={dias?.slice(-14)} />
    case 'kpi:converter':
      return <KpiCard valor={c.cargando ? '…' : (m?.pendientes_converter ?? 0)} etiqueta="En cola Converter" sub="esperando revisión" destaca={!c.cargando && (m?.pendientes_converter ?? 0) > 0} />
    case 'kpi:verificacion':
      return <KpiCard valor={c.cargando ? '…' : (m?.verificacion_hoy ? '✓' : '—')} etiqueta="Verificación de hoy" sub={m?.verificacion_hoy ? 'registrada' : 'sin registrar'} destaca={!c.cargando && !!m?.verificacion_hoy} />
    case 'panel:usuarios_activos':
      return <UsuariosActivos usuarios={c.actividad?.usuarios_activos ?? []} cargando={c.cargando} />
    case 'panel:converter':
      return <ConverterPanel items={c.actividad?.converter_recientes ?? []} cargando={c.cargando} />
    case 'panel:trace':
      return <TracePanel items={c.actividad?.trace_recientes ?? []} cargando={c.cargando} />
    case 'panel:solicitudes':
      return <SolicitudesPanel items={c.actividad?.solicitudes_recientes ?? []} cargando={c.cargando} />
    case 'panel:envios_fallidos':
      return <EnviosFallidosPanel items={c.actividad?.envios_fallidos ?? []} cargando={c.cargando} />
    case 'panel:verificaciones':
      return <VerificacionesPanel items={c.actividad?.verificaciones_recientes ?? []} cargando={c.cargando} />
    case 'cliente:encabezado': {
      const area = c.usuario.area ?? 'cromatografia'
      const config = AREAS[area]
      return (
        <PortalHero
          etiqueta={config.nombre}
          titulo={c.usuario.plantaNombre ?? c.usuario.clienteNombre ?? c.usuario.nombre}
          descripcion={`Portal de cliente · ${config.nombre}. Acceso exclusivo a tus datos.`}
        />
      )
    }
    case 'cliente:saludo':
      return <SaludoCliente nombre={c.usuario.plantaNombre ?? c.usuario.clienteNombre ?? c.usuario.nombre} datos={c.panelCliente} cargando={c.cargandoCliente} />
    case 'cliente:ultimo_informe':
      return <UltimoInformeCliente datos={c.panelCliente} cargando={c.cargandoCliente} />
    case 'cliente:informes_mes':
      return <InformesPorMes datos={c.panelCliente} cargando={c.cargandoCliente} />
    case 'cliente:especies':
      return <GraficoDona titulo="Informes por especie" unidad="informes" datos={c.panelCliente?.por_especie ?? []} cargando={c.cargandoCliente} />
    case 'cliente:analitos':
      return <GraficoBarras titulo="Análisis más medidos" sub="resultados por analito" datos={c.panelCliente?.por_analito ?? []} cargando={c.cargandoCliente} />
    case 'cliente:accesos':
      return <AccesosCliente usuario={c.usuario} />
    case 'cliente:reporte':
      return <ReporteView clienteFijo={c.usuario.clienteNombre ?? c.usuario.nombre} plantaFija={c.usuario.plantaNombre} onCropChange={c.setEspecie} />
    case 'cliente:accutab':
      return <InformesAccutabCliente />
    default:
      return null
  }
}

/** Solo las cuentas con widgets de actividad necesitan pedir esos datos (y refrescarlos cada 30 s). */
function ConActividad({ usuario, piezas }: { usuario: Usuario; piezas: Pieza[] }) {
  const { actividad, status } = useActividadDashboard()
  return <Tablero usuario={usuario} piezas={piezas} actividad={actividad} cargando={status === 'loading'} />
}

function Tablero({ usuario, piezas, actividad, cargando }: { usuario: Usuario; piezas: Pieza[]; actividad: ActividadDashboard | null; cargando: boolean }) {
  const [especie, setEspecie] = useState<string | null>(null)
  const usaSeries = piezas.some((p) => p.id.startsWith('grafico:') || p.id === 'kpi:solicitudes' || p.id === 'kpi:semana')
  const { series, status: estadoSeries } = useSeriesDashboard(usaSeries)
  const usaCliente = piezas.some((p) => CON_DATOS_CLIENTE.includes(p.id))
  const { datos: panelCliente, status: estadoCliente } = usePanelCliente(usaCliente)
  const ctx: Contexto = { usuario, actividad, cargando, series, cargandoSeries: estadoSeries === 'loading', panelCliente, cargandoCliente: estadoCliente === 'loading', especie, setEspecie }
  const ordenadas = [...piezas].sort((a, b) => a.y - b.y || a.x - b.x)
  return (
    <div className={styles.tablero}>
      {ordenadas.map((p, i) => {
        const contenido = dibujar(p.id, ctx)
        if (!contenido) return null
        return (
          <div
            key={p.id}
            className={styles.celda}
            style={{ '--x': p.x, '--y': p.y, '--w': p.w, '--h': p.h, '--orden': i } as React.CSSProperties}
          >
            {contenido}
          </div>
        )
      })}
    </div>
  )
}

export function PanelPersonalizado({ usuario, piezas }: { usuario: Usuario; piezas: Pieza[] }) {
  const esCliente = usuario.tipoAcceso === 'cliente'
  const usaActividad = piezas.some((p) => ['kpi:', 'panel:', 'hero:', 'carrusel:'].some((pre) => p.id.startsWith(pre)))
  return (
    <div>
      {!esCliente && <Header title="Panel general" description="Tu panel de inicio." />}
      {usaActividad ? (
        <ConActividad usuario={usuario} piezas={piezas} />
      ) : (
        <Tablero usuario={usuario} piezas={piezas} actividad={null} cargando={false} />
      )}
    </div>
  )
}
