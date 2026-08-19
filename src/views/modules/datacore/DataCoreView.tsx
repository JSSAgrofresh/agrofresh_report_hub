import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { areaDeModulo } from '@/constants/areas'
import {
  auditar,
  corregirGrupo,
  corregirValores,
  crearStaging,
  descartarStaging,
  deshacer,
  estadoStaging,
  historialStaging,
  listarTablas,
  promover,
  urlExportar,
  valoresColumna,
  verTabla,
} from '@/features/auditoria'
import type {
  EntradaHistorial,
  EstadoStaging,
  GrupoInconsistencia,
  InfoTabla,
  PaginaTabla,
  ResultadoAuditoria,
  ValoresColumna,
} from '@/features/auditoria'
import {
  aprobarLotePendientes,
  aprobarPendiente,
  descartarLotePendientes,
  descartarPendiente,
  listarPendientes,
} from '@/features/ingest'
import type { Pendiente } from '@/features/ingest'
import { HttpError } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import styles from './DataCoreView.module.css'

type Vista = 'tabla' | 'modelo'
const TAMANO_PAGINA = 30
const TAMANO_PENDIENTES = 50

// Espejo liviano de CAMPOS_AUDITABLES en el backend: solo para decidir qué
// encabezados de columna son clicables en la Vista de tabla. El backend es
// quien de verdad decide qué se puede corregir (esto es solo UX).
const CAMPOS_AUDITABLES: Record<string, string[]> = {
  solicitud: [
    'especie', 'variedad', 'tipo_servicio', 'laboratorio', 'sold_to_raw', 'ship_to_raw',
    'lote', 'nro_camara', 'nro_linea', 'posicion_muestreo', 'csg', 'solicitante',
    'nombre_muestreador', 'nro_orden', 'tipo_muestra',
  ],
  producto_aplicado: ['analito_raw', 'producto_raw', 'tipo_aplicacion', 'linea_proceso'],
  resultado: ['analito_raw'],
  planta: ['nombre', 'codigo_sap'],
  cliente: ['nombre', 'codigo_sap'],
  analito: ['nombre', 'categoria', 'unidad', 'matriz'],
}

export function DataCoreView() {
  const acento = areaDeModulo('datacore')?.colorPrimario ?? 'var(--color-primary)'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [vista, setVista] = useState<Vista>('modelo')

  const [tablas, setTablas] = useState<InfoTabla[] | null>(null)
  const [tablaActiva, setTablaActiva] = useState<string>('solicitud')
  const [pagina, setPagina] = useState(1)
  const [datosTabla, setDatosTabla] = useState<PaginaTabla | null>(null)
  const [cargandoTabla, setCargandoTabla] = useState(false)

  const [staging, setStaging] = useState<EstadoStaging | null>(null)
  const [staginBusy, setStagingBusy] = useState(false)

  const [auditoria, setAuditoria] = useState<ResultadoAuditoria | null>(null)
  const [auditando, setAuditando] = useState(false)
  const [grupoAbierto, setGrupoAbierto] = useState<number | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [historial, setHistorial] = useState<EntradaHistorial[]>([])
  const [deshaciendo, setDeshaciendo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promoviendo, setPromoviendo] = useState(false)

  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [totalPendientes, setTotalPendientes] = useState(0)
  const [paginaPendientes, setPaginaPendientes] = useState(1)
  const [pendienteAbierto, setPendienteAbierto] = useState<number | null>(null)
  const [procesandoPendiente, setProcesandoPendiente] = useState<number | null>(null)
  const [procesandoLote, setProcesandoLote] = useState(false)

  const [columna, setColumna] = useState<{ tabla: string; campo: string } | null>(null)
  const [datosColumna, setDatosColumna] = useState<ValoresColumna | null>(null)
  const [cargandoColumna, setCargandoColumna] = useState(false)
  const [seleccionColumna, setSeleccionColumna] = useState<Set<string>>(new Set())
  const [destinoColumna, setDestinoColumna] = useState('')
  const [unificando, setUnificando] = useState(false)

  useEffect(() => {
    listarTablas()
      .then(setTablas)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar el listado de tablas.'))
    estadoStaging()
      .then((r) => {
        setStaging(r)
        if (r.activo) void cargarHistorial()
      })
      .catch(() => undefined)
    void cargarPendientes()
  }, [])

  async function cargarPendientes(pagina = paginaPendientes) {
    listarPendientes(pagina, TAMANO_PENDIENTES)
      .then((r) => {
        setPendientes(r.filas)
        setTotalPendientes(r.total)
        setPaginaPendientes(r.pagina)
      })
      .catch(() => undefined)
  }

  async function aprobar(id: number, correcciones?: Record<string, string>) {
    setProcesandoPendiente(id)
    setError(null)
    try {
      await aprobarPendiente(id, correcciones)
      setPendienteAbierto(null)
      await cargarPendientes()
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aprobar ese pendiente.')
    } finally {
      setProcesandoPendiente(null)
    }
  }

  async function descartar(id: number) {
    if (!confirm('¿Descartar esta fila? No se va a cargar a la base de datos.')) return
    setProcesandoPendiente(id)
    setError(null)
    try {
      await descartarPendiente(id)
      setPendienteAbierto(null)
      await cargarPendientes()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo descartar ese pendiente.')
    } finally {
      setProcesandoPendiente(null)
    }
  }

  async function aprobarTodos() {
    if (
      !confirm(
        `¿Aprobar los ${totalPendientes.toLocaleString('es-CL')} pendientes tal cual están? Se cargan a la base de datos ` +
          'con los valores que traen ahora, sin corregir nada a mano. Úsalo cuando sepas que son datos reales y correctos ' +
          '-por ejemplo, justo después de partir el catálogo de cero-.',
      )
    )
      return
    setProcesandoLote(true)
    setError(null)
    try {
      await aprobarLotePendientes()
      await cargarPendientes(1)
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aprobar el lote.')
    } finally {
      setProcesandoLote(false)
    }
  }

  async function descartarTodos() {
    if (!confirm(`¿Descartar los ${totalPendientes.toLocaleString('es-CL')} pendientes? Ninguno se va a cargar a la base.`))
      return
    setProcesandoLote(true)
    setError(null)
    try {
      await descartarLotePendientes()
      await cargarPendientes(1)
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo descartar el lote.')
    } finally {
      setProcesandoLote(false)
    }
  }

  useEffect(() => {
    if (vista !== 'tabla') return
    setCargandoTabla(true)
    verTabla(tablaActiva, pagina, TAMANO_PAGINA)
      .then(setDatosTabla)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar la tabla.'))
      .finally(() => setCargandoTabla(false))
    setColumna(null)
  }, [vista, tablaActiva, pagina])

  async function cargarHistorial() {
    historialStaging()
      .then(setHistorial)
      .catch(() => undefined)
  }

  async function refrescarTablas() {
    listarTablas()
      .then(setTablas)
      .catch(() => undefined)
    if (vista === 'tabla') {
      verTabla(tablaActiva, pagina, TAMANO_PAGINA)
        .then(setDatosTabla)
        .catch(() => undefined)
    }
  }

  async function ejecutarAuditoria() {
    setAuditando(true)
    setError(null)
    try {
      setAuditoria(await auditar())
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo auditar la base de datos.')
    } finally {
      setAuditando(false)
    }
  }

  async function crearCopia() {
    setStagingBusy(true)
    setError(null)
    try {
      setStaging(await crearStaging())
      setHistorial([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo crear la copia de trabajo.')
    } finally {
      setStagingBusy(false)
    }
  }

  async function descartarCopia() {
    if (!confirm('¿Descartar la copia de trabajo? Se pierden las correcciones que todavía no se aplicaron a producción.')) return
    setStagingBusy(true)
    setError(null)
    try {
      setStaging(await descartarStaging())
      setHistorial([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo descartar la copia de trabajo.')
    } finally {
      setStagingBusy(false)
    }
  }

  async function corregir(g: GrupoInconsistencia, valor: string) {
    const clave = `${g.tabla}.${g.campo}.${g.clave}`
    setCorrigiendo(clave)
    setError(null)
    try {
      const r = await corregirGrupo({ tabla: g.tabla, campo: g.campo, clave: g.clave, valor })
      setAuditoria(r.auditoria)
      await cargarHistorial()
      if (vista === 'tabla') void refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aplicar la corrección.')
    } finally {
      setCorrigiendo(null)
    }
  }

  async function deshacerCorreccion(id: number) {
    setDeshaciendo(id)
    setError(null)
    try {
      const r = await deshacer(id)
      setAuditoria(r.auditoria)
      await cargarHistorial()
      if (vista === 'tabla') void refrescarTablas()
      if (columna) void abrirColumna(columna.tabla, columna.campo)
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo deshacer esa corrección.')
    } finally {
      setDeshaciendo(null)
    }
  }

  async function aplicarProduccion() {
    if (
      !confirm(
        'Esto reemplaza la base de datos en vivo por esta copia ya homogenizada. La base anterior queda guardada como respaldo. ¿Aplicar a producción?',
      )
    )
      return
    setPromoviendo(true)
    setError(null)
    try {
      await promover()
      setStaging({ activo: false })
      setHistorial([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aplicar a producción.')
    } finally {
      setPromoviendo(false)
    }
  }

  async function abrirColumna(tabla: string, campo: string) {
    setColumna({ tabla, campo })
    setSeleccionColumna(new Set())
    setDestinoColumna('')
    setCargandoColumna(true)
    setError(null)
    try {
      setDatosColumna(await valoresColumna(tabla, campo))
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo auditar esa columna.')
    } finally {
      setCargandoColumna(false)
    }
  }

  function alternarValorColumna(v: string) {
    setSeleccionColumna((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
    setDestinoColumna((actual) => actual || v)
  }

  async function unificarColumna() {
    if (!columna || seleccionColumna.size === 0 || !destinoColumna.trim()) return
    setUnificando(true)
    setError(null)
    try {
      const r = await corregirValores({
        tabla: columna.tabla,
        campo: columna.campo,
        valores_origen: [...seleccionColumna],
        valor_destino: destinoColumna.trim(),
      })
      setAuditoria(r.auditoria)
      await cargarHistorial()
      await abrirColumna(columna.tabla, columna.campo)
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo unificar esos valores.')
    } finally {
      setUnificando(false)
    }
  }

  const historialActivo = historial.filter((h) => !h.deshecho)

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <Header
        title="DataCore"
        description="La base de datos completa: modelo entidad-relación, exploración por tabla y auditoría de homogenización."
      />

      <Card className={styles.bannerStaging}>
        {staging?.activo ? (
          <>
            <span className={styles.bannerPuntoCopia} />
            <span>
              Trabajando sobre una copia
              {staging.creado_en && ` creada el ${new Date(staging.creado_en).toLocaleString('es-CL')}`}. Producción no se
              toca hasta que apliques los cambios.
            </span>
            <div className={styles.bannerAcciones}>
              <a className={styles.btnExportar} href={urlExportar()}>
                Exportar a Excel
              </a>
              <Button variant="secondary" onClick={() => void descartarCopia()} disabled={staginBusy}>
                Descartar copia
              </Button>
              <Button
                onClick={() => void aplicarProduccion()}
                disabled={staginBusy || promoviendo || !auditoria || auditoria.total_inconsistencias > 0}
              >
                {promoviendo ? 'Aplicando…' : 'Aplicar a producción'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className={styles.bannerPuntoVivo} />
            <span>Viendo la base en vivo, de solo lectura. Para corregir algo, crea una copia de trabajo primero.</span>
            <div className={styles.bannerAcciones}>
              <a className={styles.btnExportar} href={urlExportar()}>
                Exportar a Excel
              </a>
              <Button onClick={() => void crearCopia()} disabled={staginBusy}>
                {staginBusy ? 'Creando…' : 'Crear copia de trabajo'}
              </Button>
            </div>
          </>
        )}
      </Card>

      {totalPendientes > 0 && (
        <Card className={styles.panelAudit}>
          <div className={styles.panelAuditCabecera}>
            <div>
              <h3>Pendientes de revisión ({totalPendientes.toLocaleString('es-CL')})</h3>
              <p className={styles.panelAuditNota}>
                Ingest y Converter no cargan directo una fila que traiga un valor que parece typo o mayúsculas
                distintas de algo ya cargado (cliente, sucursal, especie, etc.) — un dato genuinamente nuevo entra
                directo, sin pedir revisión. Corrige el campo y aprueba, apruébala tal cual si en realidad está bien,
                o descártala.
              </p>
            </div>
            <div className={styles.bannerAcciones}>
              <Button variant="secondary" onClick={() => void descartarTodos()} disabled={procesandoLote}>
                Descartar todos
              </Button>
              <Button onClick={() => void aprobarTodos()} disabled={procesandoLote}>
                {procesandoLote ? 'Procesando…' : `Aprobar todos (${totalPendientes.toLocaleString('es-CL')})`}
              </Button>
            </div>
          </div>
          <div className={styles.listaGrupos}>
            {pendientes.map((p) => (
              <PendienteFila
                key={p.id}
                p={p}
                abierto={pendienteAbierto === p.id}
                onAbrir={() => setPendienteAbierto(pendienteAbierto === p.id ? null : p.id)}
                procesando={procesandoPendiente === p.id}
                onAprobar={(correcciones) => void aprobar(p.id, correcciones)}
                onDescartar={() => void descartar(p.id)}
              />
            ))}
          </div>
          {totalPendientes > TAMANO_PENDIENTES && (
            <div className={styles.paginacion}>
              <button disabled={paginaPendientes <= 1} onClick={() => void cargarPendientes(paginaPendientes - 1)}>
                ← Anterior
              </button>
              <span>
                Página {paginaPendientes} de {Math.max(1, Math.ceil(totalPendientes / TAMANO_PENDIENTES))} ·{' '}
                {totalPendientes.toLocaleString('es-CL')} pendientes
              </span>
              <button
                disabled={paginaPendientes >= Math.ceil(totalPendientes / TAMANO_PENDIENTES)}
                onClick={() => void cargarPendientes(paginaPendientes + 1)}
              >
                Siguiente →
              </button>
            </div>
          )}
        </Card>
      )}

      <Card className={styles.panelAudit}>
        <div className={styles.panelAuditCabecera}>
          <div>
            <h3>Auditoría de homogenización</h3>
            <p className={styles.panelAuditNota}>
              Busca valores que representan lo mismo pero están escritos de más de una forma (mayúsculas, espacios) en
              especie, variedad, tipo de servicio, laboratorio, Sold To y Ship To.
            </p>
          </div>
          <Button onClick={() => void ejecutarAuditoria()} disabled={auditando}>
            {auditando ? 'Auditando…' : 'Auditar'}
          </Button>
        </div>

        {auditoria && (
          <>
            <div className={styles.statsAudit}>
              <div className={`${styles.statCard} ${auditoria.total_inconsistencias > 0 ? styles.warn : styles.ok}`}>
                <span className={styles.statNum}>{auditoria.total_inconsistencias}</span>
                <span className={styles.statLbl}>grupos de inconsistencias</span>
              </div>
              <div className={`${styles.statCard} ${auditoria.total_filas_afectadas > 0 ? styles.warn : styles.ok}`}>
                <span className={styles.statNum}>{auditoria.total_filas_afectadas.toLocaleString('es-CL')}</span>
                <span className={styles.statLbl}>filas afectadas</span>
              </div>
              <div className={`${styles.statCard} ${auditoria.total_inconsistencias === 0 ? styles.ok : styles.warn}`}>
                <span className={styles.statNum}>{auditoria.total_inconsistencias === 0 ? 'Lista' : 'No lista'}</span>
                <span className={styles.statLbl}>para subir a producción</span>
              </div>
            </div>

            {historialActivo.length > 0 && (
              <div className={styles.listaCorregidos}>
                {historialActivo.map((h) => (
                  <div key={h.id} className={styles.filaCorregido}>
                    <span className={styles.filaCorregidoEtiqueta}>{h.etiqueta}</span>
                    <span>
                      → unificado a <code>{h.valor_nuevo}</code>
                    </span>
                    <span className={styles.filaGrupoFilas}>{h.filas.toLocaleString('es-CL')} filas</span>
                    <button
                      className={styles.btnDeshacer}
                      onClick={() => void deshacerCorreccion(h.id)}
                      disabled={deshaciendo === h.id}
                    >
                      {deshaciendo === h.id ? 'Deshaciendo…' : 'Deshacer'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {auditoria.total_inconsistencias === 0 ? (
              <p className={styles.panelAuditNota}>Sin inconsistencias de homogenización pendientes.</p>
            ) : (
              <ListaGrupos
                grupos={auditoria.grupos}
                abierto={grupoAbierto}
                onAbrir={setGrupoAbierto}
                puedeCorregir={Boolean(staging?.activo)}
                corrigiendo={corrigiendo}
                onCorregir={corregir}
              />
            )}
          </>
        )}
      </Card>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            className={vista === 'modelo' ? styles.tabActivo : styles.tab}
            onClick={() => setVista('modelo')}
          >
            Modelo entidad-relación
          </button>
          <button className={vista === 'tabla' ? styles.tabActivo : styles.tab} onClick={() => setVista('tabla')}>
            Vista de tabla
          </button>
        </div>
      </div>

      {vista === 'modelo' ? (
        <Card>
          <ErDiagrama />
        </Card>
      ) : (
        <>
          <Card>
            <div className={styles.selectorTabla}>
              <select
                value={tablaActiva}
                onChange={(e) => {
                  setTablaActiva(e.target.value)
                  setPagina(1)
                }}
              >
                {(tablas ?? []).map((t) => (
                  <option key={t.nombre} value={t.nombre}>
                    {t.nombre} ({t.total.toLocaleString('es-CL')})
                  </option>
                ))}
              </select>
              <span className={styles.pistaColumnas}>
                Clic en el nombre de una columna (subrayada) para auditar todos sus valores.
              </span>
            </div>

            {cargandoTabla || !datosTabla ? (
              <p className={styles.panelAuditNota}>Cargando…</p>
            ) : (
              <>
                <div className={styles.tablaScroll}>
                  <table className={styles.tablaDatos}>
                    <thead>
                      <tr>
                        {datosTabla.columnas.map((c) => {
                          const auditable = CAMPOS_AUDITABLES[tablaActiva]?.includes(c)
                          return (
                            <th key={c}>
                              {auditable ? (
                                <button className={styles.thAuditable} onClick={() => void abrirColumna(tablaActiva, c)}>
                                  {c}
                                </button>
                              ) : (
                                c
                              )}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {datosTabla.filas.map((fila, i) => (
                        <tr key={i}>
                          {datosTabla.columnas.map((c) => (
                            <td key={c}>{fila[c] === null || fila[c] === undefined ? '—' : String(fila[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.paginacion}>
                  <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                    ← Anterior
                  </button>
                  <span>
                    Página {pagina} de {Math.max(1, Math.ceil(datosTabla.total / TAMANO_PAGINA))} ·{' '}
                    {datosTabla.total.toLocaleString('es-CL')} filas
                    {staging?.activo && ' (copia de trabajo)'}
                  </span>
                  <button
                    disabled={pagina >= Math.ceil(datosTabla.total / TAMANO_PAGINA)}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente →
                  </button>
                </div>
              </>
            )}
          </Card>

          {columna && (
            <Card className={styles.panelColumna}>
              <div className={styles.panelAuditCabecera}>
                <div>
                  <h3>
                    Auditoría manual: <code>{columna.tabla}.{columna.campo}</code>
                  </h3>
                  <p className={styles.panelAuditNota}>
                    Marca los valores que representan lo mismo y elige a cuál unificarlos. Sirve para cualquier
                    diferencia -no solo mayúsculas-: typos, abreviaciones, nombres viejos, etc.
                  </p>
                </div>
                <button className={styles.cerrarColumna} onClick={() => setColumna(null)}>
                  ✕
                </button>
              </div>

              {cargandoColumna || !datosColumna ? (
                <p className={styles.panelAuditNota}>Cargando…</p>
              ) : (
                <>
                  <div className={styles.listaValoresColumna}>
                    {datosColumna.valores.map((v) => (
                      <label key={v.valor} className={styles.filaValorColumna}>
                        <input
                          type="checkbox"
                          checked={seleccionColumna.has(v.valor)}
                          onChange={() => alternarValorColumna(v.valor)}
                        />
                        <code>{v.valor}</code>
                        <span className={styles.filaGrupoFilas}>{v.filas.toLocaleString('es-CL')} filas</span>
                      </label>
                    ))}
                  </div>

                  {staging?.activo ? (
                    <div className={styles.corregirBloque}>
                      <span>Unificar seleccionados ({seleccionColumna.size}) a:</span>
                      <input
                        type="text"
                        value={destinoColumna}
                        onChange={(e) => setDestinoColumna(e.target.value)}
                        placeholder="Valor final"
                      />
                      <Button onClick={() => void unificarColumna()} disabled={unificando || seleccionColumna.size === 0}>
                        {unificando ? 'Aplicando…' : 'Unificar seleccionados'}
                      </Button>
                    </div>
                  ) : (
                    <p className={styles.panelAuditNota}>Crea una copia de trabajo para poder corregir esta columna.</p>
                  )}
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function ListaGrupos({
  grupos,
  abierto,
  onAbrir,
  puedeCorregir,
  corrigiendo,
  onCorregir,
}: {
  grupos: GrupoInconsistencia[]
  abierto: number | null
  onAbrir: (i: number | null) => void
  puedeCorregir: boolean
  corrigiendo: string | null
  onCorregir: (g: GrupoInconsistencia, valor: string) => void
}) {
  return (
    <div className={styles.listaGrupos}>
      {grupos.map((g, i) => (
        <GrupoFila
          key={`${g.tabla}-${g.campo}-${g.clave}`}
          g={g}
          abierto={abierto === i}
          onAbrir={() => onAbrir(abierto === i ? null : i)}
          puedeCorregir={puedeCorregir}
          corrigiendo={corrigiendo === `${g.tabla}.${g.campo}.${g.clave}`}
          onCorregir={(valor) => onCorregir(g, valor)}
        />
      ))}
    </div>
  )
}

function GrupoFila({
  g,
  abierto,
  onAbrir,
  puedeCorregir,
  corrigiendo,
  onCorregir,
}: {
  g: GrupoInconsistencia
  abierto: boolean
  onAbrir: () => void
  puedeCorregir: boolean
  corrigiendo: boolean
  onCorregir: (valor: string) => void
}) {
  const variantes = Object.entries(g.conteo_variantes).sort((a, b) => b[1] - a[1])
  const [elegido, setElegido] = useState(g.sugerido)

  return (
    <div className={styles.filaGrupo}>
      <button className={styles.filaGrupoCabecera} onClick={onAbrir}>
        <span className={styles.filaGrupoEtiqueta}>{g.etiqueta}</span>
        <span className={styles.filaGrupoVariantes}>
          {variantes.map(([v]) => v).join('  ≠  ')}
        </span>
        <span className={styles.filaGrupoFilas}>{g.filas.toLocaleString('es-CL')} filas</span>
      </button>
      {abierto && (
        <div className={styles.filaGrupoDetalle}>
          <p>
            Tabla <code>{g.tabla}</code>, campo <code>{g.campo}</code>. Variantes encontradas para el mismo valor:
          </p>
          <ul>
            {variantes.map(([v, n]) => (
              <li key={v}>
                <code>{v}</code> — {n.toLocaleString('es-CL')} filas
              </li>
            ))}
          </ul>

          {puedeCorregir ? (
            <div className={styles.corregirBloque}>
              <span>Unificar todo a:</span>
              <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
                {variantes.map(([v]) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <Button onClick={() => onCorregir(elegido)} disabled={corrigiendo}>
                {corrigiendo ? 'Aplicando…' : 'Corregir'}
              </Button>
            </div>
          ) : (
            <p className={styles.panelAuditNota}>Crea una copia de trabajo para poder corregir este grupo.</p>
          )}
        </div>
      )}
    </div>
  )
}

function PendienteFila({
  p,
  abierto,
  onAbrir,
  procesando,
  onAprobar,
  onDescartar,
}: {
  p: Pendiente
  abierto: boolean
  onAbrir: () => void
  procesando: boolean
  onAprobar: (correcciones?: Record<string, string>) => void
  onDescartar: () => void
}) {
  const [ediciones, setEdiciones] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.motivos.map((m) => [m.campo, m.valor])),
  )
  const informe = (p.fila['Informe'] as string | undefined) ?? '—'

  return (
    <div className={styles.filaGrupo}>
      <button className={styles.filaGrupoCabecera} onClick={onAbrir}>
        <span className={styles.filaGrupoEtiqueta}>{p.origen}</span>
        <span className={styles.filaGrupoVariantes}>
          {informe} — {p.motivos.map((m) => `${m.etiqueta}: "${m.valor}"`).join(', ')}
        </span>
        <span className={styles.filaGrupoFilas}>{new Date(p.creado_en).toLocaleDateString('es-CL')}</span>
      </button>
      {abierto && (
        <div className={styles.filaGrupoDetalle}>
          <p>Corrige el valor si es un error, o déjalo tal cual si es un dato nuevo y legítimo:</p>
          {p.motivos.map((m) => (
            <div key={m.campo} className={styles.corregirBloque}>
              <span>{m.etiqueta}:</span>
              <input
                type="text"
                value={ediciones[m.campo] ?? ''}
                onChange={(e) => setEdiciones((prev) => ({ ...prev, [m.campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className={styles.corregirBloque}>
            <Button onClick={() => onAprobar(ediciones)} disabled={procesando}>
              {procesando ? 'Aprobando…' : 'Aprobar y cargar'}
            </Button>
            <Button variant="secondary" onClick={onDescartar} disabled={procesando}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
