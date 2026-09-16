import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { MODULOS } from '@/constants/modules'
import { ModuloCard, useActividadDashboard } from '@/features/dashboard'
import type { ConverterReciente, SolicitudReciente, TraceReciente, UsuarioActivo, VerificacionReciente } from '@/features/dashboard'
import styles from './AdminGeneralDashboardView.module.css'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return formatFecha(iso)
}

function iniciales(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

function areaLabel(area: string | null): string {
  if (!area) return 'AgroFresh'
  const mapa: Record<string, string> = { cromatografia: 'Cromatografía', postventa: 'Post Venta' }
  return mapa[area] ?? area
}

function veredictoClass(resultado: string): string {
  if (resultado === 'Aceptable') return styles.ok
  if (resultado === 'No aceptable') return styles.mal
  return styles.sinDatos
}

function carpetaAFecha(carpeta: string): string {
  const partes = carpeta.split('_')
  if (partes.length < 2) return carpeta
  const fecha = partes[0]
  const hora = partes[1].replace(/-/g, ':')
  return `${fecha} ${hora}`
}

function SkeletonBloque() {
  return (
    <div className={styles.skeletonLista}>
      <Skeleton style={{ height: 36 }} />
      <Skeleton style={{ height: 36 }} />
      <Skeleton style={{ height: 36 }} />
    </div>
  )
}

function KpiCard({ valor, etiqueta, sub, destaca }: { valor: number | string; etiqueta: string; sub?: string; destaca?: boolean }) {
  return (
    <Card className={styles.kpi}>
      <p className={`${styles.kpiValor} ${destaca ? styles.kpiDestaca : ''}`}>{valor}</p>
      <p className={styles.kpiEtiqueta}>{etiqueta}</p>
      {sub && <p className={styles.kpiSub}>{sub}</p>}
    </Card>
  )
}

function UsuariosActivos({ usuarios, cargando }: { usuarios: UsuarioActivo[]; cargando: boolean }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader}>
        <span className={styles.pulseDot} />
        Usuarios activos
        <span className={styles.badge}>{cargando ? '…' : usuarios.length}</span>
      </h3>
      {cargando ? <SkeletonBloque /> : usuarios.length === 0 ? (
        <p className={styles.vacio}>Sin actividad en la última hora.</p>
      ) : (
        <ul className={styles.usuarioLista}>
          {usuarios.map((u) => (
            <li key={u.nombre} className={styles.usuarioFila}>
              <span className={styles.avatar}>{iniciales(u.nombre)}</span>
              <span className={styles.usuarioInfo}>
                <span className={styles.usuarioNombre}>{u.nombre}</span>
                <span className={styles.usuarioArea}>{areaLabel(u.area)}</span>
              </span>
              <span className={styles.usuarioTiempo}>{tiempoRelativo(u.ultimo_uso)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ConverterPanel({ items, cargando }: { items: ConverterReciente[]; cargando: boolean }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader}>
        <span className={styles.modTag} data-mod="converter">Converter</span>
        Últimas cargas
      </h3>
      {cargando ? <SkeletonBloque /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin cargas registradas.</p>
      ) : (
        <ul className={styles.feedLista}>
          {items.map((c) => (
            <li key={c.id} className={styles.feedFila}>
              <span className={styles.feedDetalle}>
                {c.origen || 'Excel'}
                {c.n_motivos > 0 && <span className={styles.feedBadge}>{c.n_motivos} avisos</span>}
              </span>
              <span className={styles.feedFecha}>{tiempoRelativo(c.creado_en)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TracePanel({ items, cargando }: { items: TraceReciente[]; cargando: boolean }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader}>
        <span className={styles.modTag} data-mod="trace">Trace / AccuTab</span>
        Últimas lecturas pH/ORP
      </h3>
      {cargando ? <SkeletonBloque /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin lecturas AccuTab guardadas.</p>
      ) : (
        <ul className={styles.feedLista}>
          {items.map((t) => (
            <li key={t.carpeta} className={styles.feedFila}>
              <span className={styles.feedDetalle}>
                <span className={styles.feedCliente}>{t.cliente}</span>
                {t.equipo !== '—' && <span className={styles.feedSub}>{t.equipo}</span>}
              </span>
              <span className={styles.feedFecha}>{carpetaAFecha(t.carpeta).slice(0, 16)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SolicitudesPanel({ items, cargando }: { items: SolicitudReciente[]; cargando: boolean }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader}>
        <span className={styles.modTag} data-mod="ingest">Ingest</span>
        Últimas solicitudes
      </h3>
      {cargando ? <SkeletonBloque /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin solicitudes recientes.</p>
      ) : (
        <ul className={styles.solicitudLista}>
          {items.map((s) => (
            <li key={s.id} className={styles.solicitudFila}>
              <span className={styles.solicitudFecha}>{formatFecha(s.fecha_entrada)}</span>
              <span className={styles.solicitudDetalle}>
                <span className={styles.solicitudEspecie}>{s.especie}{s.variedad !== '—' ? ` · ${s.variedad}` : ''}</span>
                <span className={styles.solicitudCliente}>{s.cliente} — {s.planta}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function VerificacionesPanel({ items, cargando }: { items: VerificacionReciente[]; cargando: boolean }) {
  return (
    <Card className={styles.bloque}>
      <h3 className={styles.bloqueHeader}>
        <span className={styles.modTag} data-mod="lab">AgroFresh Lab</span>
        Verificaciones diarias
      </h3>
      {cargando ? <SkeletonBloque /> : items.length === 0 ? (
        <p className={styles.vacio}>Sin registros de verificación.</p>
      ) : (
        <ul className={styles.feedLista}>
          {items.map((v) => (
            <li key={v.fecha} className={styles.feedFila}>
              <span className={styles.feedDetalle}>
                {formatFecha(v.fecha)}
                <span className={`${styles.veredicto} ${veredictoClass(v.resultado)}`}>
                  {v.resultado || 'Sin datos'}
                </span>
              </span>
              <span className={styles.feedFecha}>guardado {tiempoRelativo(v.actualizado_en)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function AdminGeneralDashboardView() {
  const { actividad, status, ultimaActualizacion, refrescar } = useActividadDashboard()
  const cargando = status === 'loading'
  const m = actividad?.metricas

  return (
    <div>
      <Header
        title="Panel general"
        description="Vista en tiempo real de la actividad del sistema. Se actualiza cada 30 segundos."
      />

      {/* Módulos */}
      <div className={styles.grid}>
        {MODULOS.map((mod, i) => (
          <ModuloCard key={mod.id} modulo={mod} indice={i} />
        ))}
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <KpiCard
          valor={cargando ? '…' : (m?.total_solicitudes ?? 0).toLocaleString('es-CL')}
          etiqueta="Solicitudes en la base"
          sub="registros vigentes"
        />
        <KpiCard
          valor={cargando ? '…' : (m?.esta_semana ?? 0)}
          etiqueta="Ingresadas esta semana"
          sub="últimos 7 días"
          destaca={!cargando && (m?.esta_semana ?? 0) > 0}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.pendientes_converter ?? 0)}
          etiqueta="En cola Converter"
          sub="esperando revisión"
          destaca={!cargando && (m?.pendientes_converter ?? 0) > 0}
        />
        <KpiCard
          valor={cargando ? '…' : (m?.verificacion_hoy ? '✓' : '—')}
          etiqueta="Verificación de hoy"
          sub={m?.verificacion_hoy ? 'registrada' : 'sin registrar'}
          destaca={!cargando && !!m?.verificacion_hoy}
        />
      </div>

      {/* Actualización */}
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

      {/* Fila superior: usuarios + converter + trace */}
      <div className={styles.filas3}>
        <UsuariosActivos usuarios={actividad?.usuarios_activos ?? []} cargando={cargando} />
        <ConverterPanel items={actividad?.converter_recientes ?? []} cargando={cargando} />
        <TracePanel items={actividad?.trace_recientes ?? []} cargando={cargando} />
      </div>

      {/* Fila inferior: solicitudes + verificaciones */}
      <div className={styles.filas2}>
        <SolicitudesPanel items={actividad?.solicitudes_recientes ?? []} cargando={cargando} />
        <VerificacionesPanel items={actividad?.verificaciones_recientes ?? []} cargando={cargando} />
      </div>
    </div>
  )
}
