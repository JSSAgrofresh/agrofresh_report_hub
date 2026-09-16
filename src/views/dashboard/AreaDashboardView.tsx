import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { AreaHero, ModuloCard, useActividadAreaDashboard } from '@/features/dashboard'
import type { SolicitudArea, TraceReciente, VerificacionArea } from '@/features/dashboard'
import { modulosPermitidos } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'
import styles from './AreaDashboardView.module.css'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function carpetaAFecha(carpeta: string): string {
  const partes = carpeta.split('_')
  if (partes.length < 2) return carpeta
  return `${partes[0]} ${partes[1].replace(/-/g, ':')}`
}

function veredictoClass(resultado: string): string {
  if (resultado === 'Aceptable') return styles.ok
  if (resultado === 'No aceptable') return styles.mal
  return styles.sinDatos
}

function SkeletonTabla() {
  return (
    <div className={styles.skeletonLista}>
      <Skeleton style={{ height: 32 }} />
      <Skeleton style={{ height: 32 }} />
      <Skeleton style={{ height: 32 }} />
    </div>
  )
}

function KpiCard({
  valor, etiqueta, sub, color,
}: { valor: number | string; etiqueta: string; sub?: string; color?: string }) {
  return (
    <Card className={styles.kpi}>
      <p className={styles.kpiValor} style={color ? { color } : undefined}>{valor}</p>
      <p className={styles.kpiEtiqueta}>{etiqueta}</p>
      {sub && <p className={styles.kpiSub}>{sub}</p>}
    </Card>
  )
}

function SolicitudesPanel({
  items, cargando, colorPrimario,
}: { items: SolicitudArea[]; cargando: boolean; colorPrimario: string }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader} style={{ borderLeftColor: colorPrimario }}>
        Solicitudes recientes
        <span className={styles.badge}>{cargando ? '…' : items.length}</span>
      </h3>
      {cargando ? <SkeletonTabla /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin solicitudes en los últimos 14 días.</p>
      ) : (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nº</th>
              <th>Especie / Variedad</th>
              <th>Cliente</th>
              <th>Enviado por</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className={styles.tdMono}>{formatFecha(s.fecha_entrada)}</td>
                <td className={styles.tdMono}>{s.nro_solicitud ?? '—'}</td>
                <td>
                  <span className={styles.especie}>{s.especie}</span>
                  {s.variedad !== '—' && <span className={styles.variedad}> · {s.variedad}</span>}
                </td>
                <td className={styles.tdSub}>{s.cliente} — {s.planta}</td>
                <td className={styles.tdSub}>{s.enviado_por ?? <span className={styles.sinEnvio}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function VerificacionesPanel({
  items, cargando, colorPrimario,
}: { items: VerificacionArea[]; cargando: boolean; colorPrimario: string }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader} style={{ borderLeftColor: colorPrimario }}>
        Verificaciones diarias
        <span className={styles.badge}>{cargando ? '…' : items.length}</span>
      </h3>
      {cargando ? <SkeletonTabla /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin verificaciones en los últimos 14 días.</p>
      ) : (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Resultado</th>
              <th>Creado por</th>
              <th>Revisado por</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.fecha}>
                <td className={styles.tdMono}>{formatFecha(v.fecha)}</td>
                <td>
                  <span className={`${styles.veredicto} ${veredictoClass(v.resultado)}`}>
                    {v.resultado || 'Sin datos'}
                  </span>
                </td>
                <td className={styles.tdSub}>{v.creado_por ?? '—'}</td>
                <td className={styles.tdSub}>{v.revisado_por ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function TracePanel({
  items, cargando, colorPrimario,
}: { items: TraceReciente[]; cargando: boolean; colorPrimario: string }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader} style={{ borderLeftColor: colorPrimario }}>
        Lecturas AccuTab recientes
        <span className={styles.badge}>{cargando ? '…' : items.length}</span>
      </h3>
      {cargando ? <SkeletonTabla /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin lecturas AccuTab guardadas.</p>
      ) : (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha / hora</th>
              <th>Cliente</th>
              <th>Equipo</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.carpeta}>
                <td className={styles.tdMono}>{carpetaAFecha(t.carpeta).slice(0, 16)}</td>
                <td className={styles.especie}>{t.cliente}</td>
                <td className={styles.tdSub}>{t.equipo}</td>
                <td className={styles.tdSub}>{t.responsable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export function AreaDashboardView({ area, usuario }: { area: AreaId; usuario: Usuario }) {
  const config = AREAS[area]
  const { actividad, status, ultimaActualizacion, refrescar } = useActividadAreaDashboard(area)
  const cargando = status === 'loading'
  const m = actividad?.metricas
  const modulos = modulosPermitidos(usuario)

  return (
    <div>
      <AreaHero
        area={config}
        titulo={`Panel de administración · ${config.nombre}`}
        descripcion="Resumen de la operación y acceso a las funciones habilitadas para tu área."
      />

      {modulos.length > 0 && (
        <div className={styles.grid}>
          {modulos.map((mod, i) => (
            <ModuloCard key={mod.id} modulo={mod} indice={i} acento={config.colorPrimario} />
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className={styles.kpis}>
        <KpiCard
          valor={cargando ? '…' : (m?.total_solicitudes ?? 0).toLocaleString('es-CL')}
          etiqueta="Solicitudes en la base"
          sub="registros vigentes"
          color={config.colorOscuro}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.solicitudes_semana ?? 0)}
          etiqueta="Solicitudes esta semana"
          sub="últimos 7 días"
          color={!cargando && (m?.solicitudes_semana ?? 0) > 0 ? config.colorPrimario : undefined}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.verificaciones_semana ?? 0)}
          etiqueta="Verificaciones esta semana"
          sub="últimos 7 días"
          color={!cargando && (m?.verificaciones_semana ?? 0) > 0 ? config.colorPrimario : undefined}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.verificacion_hoy ? '✓' : '—')}
          etiqueta="Verificación de hoy"
          sub={m?.verificacion_hoy ? 'registrada' : 'sin registrar'}
          color={!cargando && m?.verificacion_hoy ? config.colorPrimario : undefined}
        />
      </div>

      {/* Barra de actualización */}
      <div className={styles.actualizacion}>
        <button type="button" className={styles.refrescarBtn} onClick={refrescar}>
          ↻ Refrescar
        </button>
        {ultimaActualizacion && (
          <span className={styles.timestamp}>
            Actualizado {ultimaActualizacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Tablas de actividad */}
      <div className={styles.columnas}>
        {area === 'cromatografia' && (
          <SolicitudesPanel
            items={actividad?.solicitudes_recientes ?? []}
            cargando={cargando}
            colorPrimario={config.colorPrimario}
          />
        )}
        {area === 'postventa' && (
          <TracePanel
            items={actividad?.trace_recientes ?? []}
            cargando={cargando}
            colorPrimario={config.colorPrimario}
          />
        )}
        <VerificacionesPanel
          items={actividad?.verificaciones_recientes ?? []}
          cargando={cargando}
          colorPrimario={config.colorPrimario}
        />
      </div>
    </div>
  )
}
