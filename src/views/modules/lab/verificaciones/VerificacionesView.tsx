import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import {
  borradorVacio,
  guardarRegistro,
  eliminarRegistro,
  obtenerConfig,
  obtenerRegistro,
  registroABorrador,
  calcularDia,
  descargarDiaExcel,
  descargarDiaPdf,
  explicarErrorDeConfig,
  NOMBRE_SECCION,
  SECCIONES,
} from '@/features/verificaciones'
import type {
  ConfigVerificaciones,
  RegistroInput,
  Respuesta,
  Seccion as SeccionId,
} from '@/features/verificaciones'
import {
  Calculado,
  CampoNumero,
  ObservacionModal,
  Seccion,
  SelectorRespuesta,
  Veredicto,
  VeredictoDia,
} from './componentes'
import styles from './Verificaciones.module.css'

/**
 * Verificaciones diarias  — el formulario del día.
 *
 * Reemplaza la hoja «Ingreso_Diario» del Excel con macros. Las diferencias
 * que importan:
 *
 *   · Los veredictos se calculan mientras se escribe, con el mismo cálculo
 *     que después aplica el servidor al guardar.
 *   · No hay "traspaso" al histórico: guardar el día ES el histórico.
 *   · Un día, un registro. Volver a la misma fecha abre lo que ya se guardó,
 *     no una hoja en blanco encima.
 *   · Con `?solo=ver` el formulario es de solo lectura (viene del histórico).
 */

/** La fecha de hoy en la zona del navegador. `toISOString()` no sirve: pasa a
 * UTC y en Chile adelanta el día desde las 21:00. */
function hoyISO(): string {
  const ahora = new Date()
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function esBorradorCompatible(valor: unknown, config: ConfigVerificaciones): valor is RegistroInput {
  if (!valor || typeof valor !== 'object') return false
  const borrador = valor as Partial<RegistroInput>
  if (!Array.isArray(borrador.micropipetas) || !Array.isArray(borrador.balanza)
    || !Array.isArray(borrador.temperaturas) || !Array.isArray(borrador.gases)) return false

  const incluyeTodos = <T,>(mediciones: T[], ids: number[], obtenerId: (medicion: T) => number) =>
    ids.every((id) => mediciones.some((medicion) => obtenerId(medicion) === id))

  return incluyeTodos(borrador.micropipetas, config.micropipetas.map((m) => m.id), (m) => m.micropipeta_id)
    && incluyeTodos(borrador.balanza, config.pesas.map((p) => p.id), (p) => p.pesa_id)
    && incluyeTodos(borrador.temperaturas, config.puntos_temperatura.map((p) => p.id), (p) => p.punto_id)
    && incluyeTodos(borrador.gases, config.gases.map((g) => g.id), (g) => g.gas_id)
}

export function VerificacionesView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [parametrosUrl] = useSearchParams()
  const [fecha, setFecha] = useState(() => parametrosUrl.get('fecha') || hoyISO())
  const soloVer = parametrosUrl.get('solo') === 'ver'
  const [config, setConfig] = useState<ConfigVerificaciones | null>(null)
  const [borrador, setBorrador] = useState<RegistroInput | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const claveLocal = `verif_borrador_${fecha}`

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerConfig(), obtenerRegistro(fecha)])
      .then(([catalogos, registro]) => {
        if (!vigente) return
        setError(null)
        setConfig(catalogos)
        // Si hay borrador local para este día y el día no está guardado en el servidor,
        // restauramos el avance; si ya está guardado, arrancamos desde el servidor.
        if (!registro) {
          try {
            const local = localStorage.getItem(claveLocal)
            if (local) {
              const restaurado: unknown = JSON.parse(local)
              if (esBorradorCompatible(restaurado, catalogos)) {
                setBorrador(restaurado)
                setSucio(true)
                setCargando(false)
                setGuardadoEn(null)
                return
              }
              localStorage.removeItem(claveLocal)
            }
          } catch { /* ignorar errores de localStorage */ }
        }
        setBorrador(registro ? registroABorrador(registro, catalogos) : borradorVacio(catalogos))
        setGuardadoEn(registro?.actualizado_en ?? null)
        setSucio(false)
        setCargando(false)
      })
      .catch((e: unknown) => {
        if (!vigente) return
        setError(explicarErrorDeConfig(e))
        setConfig(null)
        setBorrador(null)
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha])

  useEffect(() => {
    if (!sucio || soloVer) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sucio, soloVer])

  const previa = useMemo(
    () => (config && borrador ? calcularDia(borrador, config) : null),
    [config, borrador],
  )

  const editar = useCallback((cambio: (previo: RegistroInput) => RegistroInput) => {
    if (soloVer) return
    setBorrador((previo) => {
      if (!previo) return previo
      const nuevo = cambio(previo)
      // Auto-save en localStorage solo si el día aún no está guardado en el servidor
      if (!guardadoEn) {
        try { localStorage.setItem(claveLocal, JSON.stringify(nuevo)) } catch { /* sin espacio */ }
      }
      return nuevo
    })
    setSucio(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloVer, guardadoEn, claveLocal])

  async function guardar() {
    if (!borrador || soloVer) return
    setGuardando(true)
    setError(null)
    try {
      const guardado = await guardarRegistro(fecha, borrador)
      try { localStorage.removeItem(claveLocal) } catch { /* ok */ }
      if (config) setBorrador(registroABorrador(guardado, config))
      setGuardadoEn(guardado.actualizado_en)
      setSucio(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el día.')
    } finally {
      setGuardando(false)
    }
  }

  async function limpiarRegistro() {
    if (!config) return
    setGuardando(true)
    setError(null)
    try {
      if (guardadoEn) await eliminarRegistro(fecha)
      try { localStorage.removeItem(claveLocal) } catch { /* ok */ }
      setBorrador(borradorVacio(config))
      setGuardadoEn(null)
      setSucio(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo limpiar el registro.')
    } finally {
      setGuardando(false)
    }
  }

  function irASeccion(id: SeccionId) {
    document.getElementById(`seccion-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function cambiarFecha(nueva: string) {
    if (sucio && !window.confirm('Hay cambios sin guardar en este día. ¿Cambiar de fecha igual?')) return
    setCargando(true)
    setFecha(nueva)
  }

  return (
    <div className={styles.wrap}>
      <Header
        title="Verificaciones diarias"
        description="Control diario de los equipos del laboratorio de cromatografía."
        acciones={
          <>
            <Button variant="secondary" onClick={() => navigate(ROUTES.agrofreshLabVerificacionesHistorico)}>
              Histórico
            </Button>
            {user && esAdminGeneral(user) && (
              <Button variant="secondary" onClick={() => navigate(ROUTES.agrofreshLabVerificacionesCriterios)}>
                Criterios
              </Button>
            )}
          </>
        }
      />

      {soloVer && (
        <div className={styles.soloLecturaBarra}>
          <p className={styles.soloLecturaAviso}>
            Solo lectura — estás viendo un registro guardado.
          </p>
          <div className={styles.soloLecturaAcciones}>
            <Button onClick={() => navigate(`${ROUTES.agrofreshLabVerificaciones}?fecha=${fecha}`)}>
              Editar
            </Button>
            <Button
              variant="secondary"
              onClick={() => void descargarDiaPdf(fecha)}
              disabled={!guardadoEn}
            >
              Descargar PDF
            </Button>
            <Button
              variant="secondary"
              onClick={() => void descargarDiaExcel(fecha)}
              disabled={!guardadoEn}
            >
              Descargar Excel
            </Button>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {cargando && <Card className={styles.vacio}>Cargando el día…</Card>}

      {!cargando && borrador && config && previa && (
        <>
          <div className={styles.resumen}>
            <div className={styles.resumenCampos}>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>Fecha</span>
                <input
                  type="date"
                  className={cn(styles.input, styles.inputCorto)}
                  value={fecha}
                  max={hoyISO()}
                  disabled={soloVer}
                  onChange={(e) => cambiarFecha(e.target.value)}
                />
              </label>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>Analista</span>
                <input
                  className={styles.input}
                  style={{ width: 160 }}
                  value={borrador.analista}
                  placeholder="Nombre"
                  disabled={soloVer}
                  onChange={(e) => editar((p) => ({ ...p, analista: e.target.value }))}
                />
              </label>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>
                  Temp. agua <span className={styles.unidad}>(°C)</span>
                </span>
                <select
                  className={cn(styles.input, styles.inputCorto)}
                  value={borrador.temperatura_agua ?? ''}
                  disabled={soloVer}
                  onChange={(e) =>
                    editar((p) => ({
                      ...p,
                      temperatura_agua: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {config.tabla_z.map((fz) => (
                    <option key={fz.temperatura} value={fz.temperatura}>
                      {fz.temperatura} °C
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.campo}>
                <span className={styles.etiqueta}>Factor Z <span className={styles.unidad}>(µL/mg)</span></span>
                <span className={styles.calculado} style={{ padding: '7px 0' }}>
                  {previa.factor_z === null ? '—' : previa.factor_z.toFixed(4)}
                </span>
              </div>
              <VeredictoDia resultado={previa.resultado} />
            </div>

            <div className={styles.resumenChips}>
              {SECCIONES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    styles.chip,
                    previa.secciones[id] === 'Aceptable' && styles.chipOk,
                    previa.secciones[id] === 'No aceptable' && styles.chipMal,
                  )}
                  onClick={() => irASeccion(id)}
                  title={`Ir a ${NOMBRE_SECCION[id]}`}
                >
                  <span className={styles.chipPunto} />
                  {NOMBRE_SECCION[id]}
                </button>
              ))}
            </div>
          </div>

          {/* --- 1. Micropipetas --- */}
          <Seccion
            id="seccion-micropipetas"
            numero={1}
            titulo="Micropipetas"
            nota="Verificación gravimétrica: tres pesadas por equipo. El volumen se corrige por el factor Z del agua a la temperatura del día."
            resultado={previa.secciones.micropipetas}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Código</th>
                    <th>Peso 1 <span className={styles.unidad}>(g)</span></th>
                    <th>Peso 2 <span className={styles.unidad}>(g)</span></th>
                    <th>Peso 3 <span className={styles.unidad}>(g)</span></th>
                    <th>Vol. medio <span className={styles.unidad}>(µL)</span></th>
                    <th>Rango de tolerancia</th>
                    <th>Criterio</th>
                    <th>Resultado</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.micropipetas.map((m, i) => {
                    const equipo = config.micropipetas.find((e) => e.id === m.micropipeta_id)
                    const calculo = previa.micropipetas.get(m.micropipeta_id)
                    if (!equipo) return null
                    return (
                      <tr
                        key={m.micropipeta_id}
                        className={cn(calculo?.resultado === 'No aceptable' && styles.filaMal)}
                      >
                        <td className={styles.celdaEquipo}>
                          {equipo.nombre}
                          <span className={styles.celdaNota}>{equipo.volumen_nominal} µL nominal</span>
                        </td>
                        <td className={styles.criterio}>{equipo.codigo || '—'}</td>
                        {(['peso_1', 'peso_2', 'peso_3'] as const).map((campo) => (
                          <td key={campo}>
                            <CampoNumero
                              valor={m[campo]}
                              ancho={84}
                              onCambio={(v) =>
                                editar((p) => ({
                                  ...p,
                                  micropipetas: p.micropipetas.map((x, j) =>
                                    j === i ? { ...x, [campo]: v } : x,
                                  ),
                                }))
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <Calculado valor={calculo?.volumen_medio ?? null} />
                        </td>
                        <td className={styles.criterio}>
                          {equipo.volumen_nominal - equipo.tolerancia} a {equipo.volumen_nominal + equipo.tolerancia} <span className={styles.unidad}>µL</span>
                        </td>
                        <td className={styles.criterio}>± {equipo.tolerancia} µL</td>
                        <td>
                          <Veredicto resultado={calculo?.resultado ?? ''} />
                        </td>
                        <td>
                          <ObservacionModal
                            valor={m.observacion}
                            soloVer={soloVer}
                            onCambio={(v) =>
                              editar((p) => ({
                                ...p,
                                micropipetas: p.micropipetas.map((x, j) =>
                                  j === i ? { ...x, observacion: v } : x,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- 2. Balanza --- */}
          <Seccion
            id="seccion-balanza"
            numero={2}
            titulo="Balanza analítica"
            nota="Tres lecturas por pesa patrón. El criterio es cuánto se aleja el promedio del valor nominal de la pesa."
            resultado={previa.secciones.balanza}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Pesa patrón</th>
                    <th>Código</th>
                    <th>Lectura 1 <span className={styles.unidad}>(g)</span></th>
                    <th>Lectura 2 <span className={styles.unidad}>(g)</span></th>
                    <th>Lectura 3 <span className={styles.unidad}>(g)</span></th>
                    <th>Promedio <span className={styles.unidad}>(mg)</span></th>
                    <th>Rango de tolerancia</th>
                    <th>Criterio</th>
                    <th>Resultado</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.balanza.map((b, i) => {
                    const pesa = config.pesas.find((p) => p.id === b.pesa_id)
                    const calculo = previa.balanza.get(b.pesa_id)
                    if (!pesa) return null
                    return (
                      <tr
                        key={b.pesa_id}
                        className={cn(calculo?.resultado === 'No aceptable' && styles.filaMal)}
                      >
                        <td className={styles.celdaEquipo}>
                          {pesa.nombre}
                          <span className={styles.celdaNota}>{pesa.valor_nominal} mg nominal</span>
                        </td>
                        <td className={styles.criterio}>{pesa.codigo || '—'}</td>
                        {(['lectura_1', 'lectura_2', 'lectura_3'] as const).map((campo) => (
                          <td key={campo}>
                            <CampoNumero
                              valor={b[campo]}
                              ancho={92}
                              onCambio={(v) =>
                                editar((p) => ({
                                  ...p,
                                  balanza: p.balanza.map((x, j) => (j === i ? { ...x, [campo]: v } : x)),
                                }))
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <Calculado valor={calculo?.promedio ?? null} decimales={4} />
                        </td>
                        <td className={styles.criterio}>
                          {pesa.valor_nominal - pesa.tolerancia} a {pesa.valor_nominal + pesa.tolerancia} <span className={styles.unidad}>mg</span>
                        </td>
                        <td className={styles.criterio}>± {pesa.tolerancia} mg</td>
                        <td>
                          <Veredicto resultado={calculo?.resultado ?? ''} />
                        </td>
                        <td>
                          <ObservacionModal
                            valor={b.observacion}
                            soloVer={soloVer}
                            onCambio={(v) =>
                              editar((p) => ({
                                ...p,
                                balanza: p.balanza.map((x, j) => (j === i ? { ...x, observacion: v } : x)),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- 3. Temperatura --- */}
          <Seccion
            id="seccion-temperatura"
            numero={3}
            titulo="Temperatura"
            nota="Sala del laboratorio, refrigerador y congelador de reactivos."
            resultado={previa.secciones.temperatura}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla} style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Punto de control</th>
                    <th>Código</th>
                    <th>Lectura <span className={styles.unidad}>(°C)</span></th>
                    <th>Criterio</th>
                    <th>Resultado</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.temperaturas.map((t, i) => {
                    const punto = config.puntos_temperatura.find((p) => p.id === t.punto_id)
                    const resultado = previa.temperaturas.get(t.punto_id) ?? ''
                    if (!punto) return null
                    return (
                      <tr key={t.punto_id} className={cn(resultado === 'No aceptable' && styles.filaMal)}>
                        <td className={styles.celdaEquipo}>{punto.nombre}</td>
                        <td className={styles.criterio}>{punto.codigo || '—'}</td>
                        <td>
                          <CampoNumero
                            valor={t.lectura}
                            ancho={92}
                            onCambio={(v) =>
                              editar((p) => ({
                                ...p,
                                temperaturas: p.temperaturas.map((x, j) =>
                                  j === i ? { ...x, lectura: v } : x,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td className={styles.criterio}>
                          {punto.minimo} a {punto.maximo} °C
                        </td>
                        <td>
                          <Veredicto resultado={resultado} />
                        </td>
                        <td>
                          <ObservacionModal
                            valor={t.observacion}
                            soloVer={soloVer}
                            onCambio={(v) =>
                              editar((p) => ({
                                ...p,
                                temperaturas: p.temperaturas.map((x, j) =>
                                  j === i ? { ...x, observacion: v } : x,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                  {/* Termómetros de referencia */}
                  {(['termometro_1', 'termometro_2'] as const).map((campo, i) => (
                    <tr key={campo}>
                      <td className={styles.celdaEquipo}>Termómetro {i + 1}</td>
                      <td className={styles.criterio}>—</td>
                      <td>
                        <CampoNumero
                          valor={borrador[campo]}
                          ancho={92}
                          onCambio={(v) => editar((p) => ({ ...p, [campo]: v }))}
                        />
                      </td>
                      <td className={styles.criterio}>—</td>
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- 4. Gases --- */}
          <Seccion
            id="seccion-gases"
            numero={4}
            titulo="Presión de gases"
            nota="Un cilindro por línea. La pregunta de fugas es una sola para el día y pesa igual que la presión de cada cilindro."
            resultado={previa.secciones.gases}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Gas</th>
                    <th>Código</th>
                    <th>Cód. cilindro</th>
                    <th>P. contenido <span className={styles.unidad}>(psi)</span></th>
                    <th>P. trabajo <span className={styles.unidad}>(psi)</span></th>
                    <th>Resultado</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {borrador.gases.map((g, i) => {
                    const gas = config.gases.find((x) => x.id === g.gas_id)
                    const resultado = previa.gases.get(g.gas_id) ?? ''
                    if (!gas) return null
                    const cambiar = (campo: 'presion_contenido' | 'presion_trabajo', v: number | null) =>
                      editar((p) => ({
                        ...p,
                        gases: p.gases.map((x, j) => (j === i ? { ...x, [campo]: v } : x)),
                      }))
                    return (
                      <tr key={g.gas_id} className={cn(resultado === 'No aceptable' && styles.filaMal)}>
                        <td className={styles.celdaEquipo}>{gas.nombre}</td>
                        <td className={styles.criterio}>{gas.codigo || '—'}</td>
                        <td>
                          <input
                            className={styles.input}
                            style={{ width: 110 }}
                            value={g.codigo_cilindro}
                            placeholder="Código"
                            disabled={soloVer}
                            onChange={(e) =>
                              editar((p) => ({
                                ...p,
                                gases: p.gases.map((x, j) =>
                                  j === i ? { ...x, codigo_cilindro: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <CampoNumero
                            valor={g.presion_contenido}
                            ancho={100}
                            onCambio={(v) => cambiar('presion_contenido', v)}
                          />
                        </td>
                        <td>
                          <CampoNumero
                            valor={g.presion_trabajo}
                            ancho={100}
                            onCambio={(v) => cambiar('presion_trabajo', v)}
                          />
                        </td>
                        <td>
                          <Veredicto resultado={resultado} />
                        </td>
                        <td>
                          <ObservacionModal
                            valor={g.observacion}
                            soloVer={soloVer}
                            onCambio={(v) =>
                              editar((p) => ({
                                ...p,
                                gases: p.gases.map((x, j) => (j === i ? { ...x, observacion: v } : x)),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                  <tr className={cn(previa.resultado_fugas === 'No aceptable' && styles.filaMal)}>
                    <td className={styles.celdaEquipo} colSpan={3}>
                      ¿Fugas visibles en alguna conexión?
                      <span className={styles.celdaNota}>Debe ser No</span>
                    </td>
                    <td colSpan={2}>
                      <SelectorRespuesta
                        valor={borrador.fugas_visibles}
                        onCambio={(v) => editar((p) => ({ ...p, fugas_visibles: v }))}
                      />
                    </td>
                    <td>
                      <Veredicto resultado={previa.resultado_fugas} />
                    </td>
                    <td>
                      {borrador.fugas_visibles === 'Sí' && (
                        <ObservacionModal
                          valor={borrador.fugas_observacion}
                          soloVer={soloVer}
                          onCambio={(v) => editar((p) => ({ ...p, fugas_observacion: v }))}
                        />
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- 5. Inyector --- */}
          <Seccion
            id="seccion-inyector"
            numero={5}
            titulo="Inyector"
            nota="Aceptable si se limpió la aguja y, además, la aguja está sana o fue reemplazada."
            analista={{
              valor: borrador.inyector.analista,
              deshabilitado: soloVer,
              onCambio: (valor) => editar((p) => ({ ...p, inyector: { ...p.inyector, analista: valor } })),
            }}
            resultado={previa.secciones.inyector}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla} style={{ minWidth: 520 }}>
                <tbody>
                  {(
                    [
                      ['limpieza_aguja', 'Limpieza de aguja realizada', ['Sí', 'No']],
                      ['aguja_danada', '¿Aguja dañada?', ['Sí', 'No']],
                      ['aguja_reemplazada', 'Aguja reemplazada', ['Sí', 'No', 'N.A.']],
                      ['cambio_septa', 'Cambio de septa realizado', ['Sí', 'No', 'N.A.']],
                    ] as const
                  ).map(([campo, etiqueta, opciones]) => (
                    <tr key={campo}>
                      <td className={styles.celdaEquipo}>{etiqueta}</td>
                      <td>
                        <SelectorRespuesta
                          valor={borrador.inyector[campo]}
                          opciones={opciones as unknown as Respuesta[]}
                          onCambio={(v) => editar((p) => ({ ...p, inyector: { ...p.inyector, [campo]: v } }))}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className={styles.celdaEquipo}>Método cargado</td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ width: 220 }}
                        value={borrador.inyector.metodo_nombre}
                        placeholder="Nombre del método (ej. ECD_Pes)"
                        disabled={soloVer}
                        onChange={(e) =>
                          editar((p) => ({
                            ...p,
                            inyector: { ...p.inyector, metodo_nombre: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.celdaEquipo}>Observaciones del inyector</td>
                    <td>
                      <input
                        className={styles.input}
                        value={borrador.inyector.observaciones}
                        placeholder="Opcional"
                        disabled={soloVer}
                        onChange={(e) =>
                          editar((p) => ({
                            ...p,
                            inyector: { ...p.inyector, observaciones: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- 6. Detector y método --- */}
          <Seccion
            id="seccion-detector"
            numero={6}
            titulo="Detector y método"
            nota="Voltaje de la perla, método cargado y output del detector."
            analista={{
              valor: borrador.detector.analista,
              deshabilitado: soloVer,
              onCambio: (valor) => editar((p) => ({ ...p, detector: { ...p.detector, analista: valor } })),
            }}
            resultado={previa.secciones.detector}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla} style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    <th>Valor</th>
                    <th>Criterio</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={cn(previa.detector.resultado_voltaje === 'No aceptable' && styles.filaMal)}>
                    <td className={styles.celdaEquipo}>Voltaje de la perla (V)</td>
                    <td>
                      <CampoNumero
                        valor={borrador.detector.voltaje_perla}
                        ancho={100}
                        onCambio={(v) => editar((p) => ({ ...p, detector: { ...p.detector, voltaje_perla: v } }))}
                      />
                    </td>
                    <td className={styles.criterio}>
                      {rango(config, 'perla_voltaje_min', 'perla_voltaje_max')} V
                    </td>
                    <td>
                      <Veredicto resultado={previa.detector.resultado_voltaje} />
                    </td>
                  </tr>
                  <tr className={cn(previa.detector.resultado_metodo === 'No aceptable' && styles.filaMal)}>
                    <td className={styles.celdaEquipo}>Método cargado</td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ width: 200 }}
                        value={borrador.detector.metodo_nombre}
                        placeholder="Nombre del método"
                        disabled={soloVer}
                        onChange={(e) =>
                          editar((p) => ({ ...p, detector: { ...p.detector, metodo_nombre: e.target.value } }))
                        }
                      />
                    </td>
                    <td className={styles.criterio}>Cualquier nombre</td>
                    <td>
                      <Veredicto resultado={previa.detector.resultado_metodo} />
                    </td>
                  </tr>
                  <tr className={cn(previa.detector.resultado_output === 'No aceptable' && styles.filaMal)}>
                    <td className={styles.celdaEquipo}>Output del detector</td>
                    <td>
                      <CampoNumero
                        valor={borrador.detector.output_detector}
                        ancho={100}
                        onCambio={(v) => editar((p) => ({ ...p, detector: { ...p.detector, output_detector: v } }))}
                      />
                    </td>
                    <td className={styles.criterio}>{rango(config, 'output_min', 'output_max')}</td>
                    <td>
                      <Veredicto resultado={previa.detector.resultado_output} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* --- Cierre --- */}
          <div className={styles.pie}>
            <Card>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>Observaciones generales del día</span>
                <textarea
                  className={styles.textarea}
                  value={borrador.observaciones}
                  placeholder="Lo que haya que dejar dicho: una lectura repetida, un equipo que se mandó a calibrar…"
                  disabled={soloVer}
                  onChange={(e) => editar((p) => ({ ...p, observaciones: e.target.value }))}
                />
              </label>
            </Card>
            <Card>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>Revisado por</span>
                <input
                  className={styles.input}
                  value={borrador.revisado_por}
                  placeholder="Nombre de quien revisa"
                  disabled={soloVer}
                  onChange={(e) => editar((p) => ({ ...p, revisado_por: e.target.value }))}
                />
              </label>
            </Card>
          </div>

          {!soloVer && (
            <div className={styles.barraAcciones}>
              <Button onClick={() => void guardar()} disabled={guardando || !sucio}>
                {guardando ? 'Guardando…' : 'Guardar el día'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const mensaje = guardadoEn
                    ? '¿Eliminar el registro guardado de este día? Se borrarán sus mediciones y no se puede deshacer.'
                    : '¿Borrar todo el avance de este día? No se puede deshacer.'
                  if (window.confirm(mensaje)) void limpiarRegistro()
                }}
                disabled={guardando}
              >
                Limpiar registro
              </Button>
              <Button
                variant="secondary"
                onClick={() => void descargarDiaPdf(fecha)}
                disabled={!guardadoEn}
                title={guardadoEn ? undefined : 'Guarda el día antes de descargarlo'}
              >
                Descargar PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => void descargarDiaExcel(fecha)}
                disabled={!guardadoEn}
                title={guardadoEn ? undefined : 'Guarda el día antes de descargarlo'}
              >
                Descargar Excel
              </Button>
              <span className={styles.estadoGuardado}>
                {sucio ? (
                  <span className={styles.sinGuardar}>Hay cambios sin guardar</span>
                ) : guardadoEn ? (
                  `Guardado ${new Date(guardadoEn).toLocaleString('es-CL')}`
                ) : (
                  'Este día todavía no se ha guardado'
                )}
              </span>
            </div>
          )}

          {soloVer && (
            <div className={styles.barraAcciones}>
              <Button variant="secondary" onClick={() => navigate(ROUTES.agrofreshLabVerificacionesHistorico)}>
                Volver al histórico
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** "0 a 1" a partir de dos parámetros globales, para mostrar el criterio al
 * lado del campo sin repetir los números en el código. */
function rango(config: ConfigVerificaciones, claveMin: string, claveMax: string): string {
  const valor = (clave: string) => config.parametros.find((p) => p.clave === clave)?.valor
  const min = valor(claveMin)
  const max = valor(claveMax)
  return min === undefined || max === undefined ? '—' : `${min} a ${max}`
}
