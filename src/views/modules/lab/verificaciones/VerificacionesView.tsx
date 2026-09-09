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
  obtenerConfig,
  obtenerRegistro,
  registroABorrador,
  calcularDia,
  descargarDiaExcel,
  NOMBRE_SECCION,
  SECCIONES,
} from '@/features/verificaciones'
import type {
  ConfigVerificaciones,
  RegistroInput,
  Respuesta,
  Seccion as SeccionId,
} from '@/features/verificaciones'
import { Calculado, CampoNumero, Seccion, SelectorRespuesta, Veredicto, VeredictoDia } from './componentes'
import styles from './Verificaciones.module.css'

/**
 * Verificaciones diarias (REG-03) — el formulario del día.
 *
 * Reemplaza la hoja «Ingreso_Diario» del Excel con macros. Las diferencias
 * que importan:
 *
 *   · Los veredictos se calculan mientras se escribe, con el mismo cálculo
 *     que después aplica el servidor al guardar.
 *   · No hay "traspaso" al histórico: guardar el día ES el histórico.
 *   · Un día, un registro. Volver a la misma fecha abre lo que ya se guardó,
 *     no una hoja en blanco encima.
 */

/** La fecha de hoy en la zona del navegador. `toISOString()` no sirve: pasa a
 * UTC y en Chile adelanta el día desde las 21:00. */
function hoyISO(): string {
  const ahora = new Date()
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function VerificacionesView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // El histórico enlaza a un día concreto con `?fecha=`; sin eso, hoy.
  const [parametrosUrl] = useSearchParams()
  const [fecha, setFecha] = useState(() => parametrosUrl.get('fecha') || hoyISO())
  const [config, setConfig] = useState<ConfigVerificaciones | null>(null)
  const [borrador, setBorrador] = useState<RegistroInput | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // La guarda `vigente` no es decorativa: si alguien cambia de fecha dos veces
  // seguidas, la respuesta de la primera puede llegar DESPUÉS de la segunda y
  // pintaría el día equivocado sobre el que se está mirando.
  useEffect(() => {
    let vigente = true
    Promise.all([obtenerConfig(), obtenerRegistro(fecha)])
      .then(([catalogos, registro]) => {
        if (!vigente) return
        setError(null)
        setConfig(catalogos)
        setBorrador(registro ? registroABorrador(registro, catalogos) : borradorVacio(catalogos))
        setGuardadoEn(registro?.actualizado_en ?? null)
        setSucio(false)
        setCargando(false)
      })
      .catch(() => {
        if (!vigente) return
        setError('No se pudo cargar la configuración del laboratorio. ¿Está el backend arriba?')
        setConfig(null)
        setBorrador(null)
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [fecha])

  // Cerrar la pestaña con un día a medio llenar es perder la mañana entera de
  // alguien. El navegador solo deja avisar, no impedir, y con eso basta.
  useEffect(() => {
    if (!sucio) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sucio])

  const previa = useMemo(
    () => (config && borrador ? calcularDia(borrador, config) : null),
    [config, borrador],
  )

  /** Toda edición pasa por acá: aplica el cambio y marca el día como sucio,
   * para que no haya forma de modificar algo sin que el botón se encienda. */
  const editar = useCallback((cambio: (previo: RegistroInput) => RegistroInput) => {
    setBorrador((previo) => (previo ? cambio(previo) : previo))
    setSucio(true)
  }, [])

  async function guardar() {
    if (!borrador) return
    setGuardando(true)
    setError(null)
    try {
      const guardado = await guardarRegistro(fecha, borrador)
      if (config) setBorrador(registroABorrador(guardado, config))
      setGuardadoEn(guardado.actualizado_en)
      setSucio(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el día.')
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

  const analistaDe = (filas: { analista: string }[]) => filas.find((f) => f.analista)?.analista ?? ''

  return (
    <div className={styles.wrap}>
      <Header
        title="Verificaciones diarias"
        description="REG-03 · Control diario de los equipos del laboratorio de cromatografía."
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
                  onChange={(e) => cambiarFecha(e.target.value)}
                />
              </label>
              <label className={styles.campo}>
                <span className={styles.etiqueta}>Temp. agua <span className={styles.unidad}>(°C)</span></span>
                <CampoNumero
                  valor={borrador.temperatura_agua}
                  ancho={90}
                  onCambio={(v) => editar((p) => ({ ...p, temperatura_agua: v }))}
                />
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

          {borrador.temperatura_agua !== null && previa.factor_z === null && (
            <p className={styles.aviso}>
              No hay factor Z para {borrador.temperatura_agua} °C en la tabla de referencia (va de 15
              a 35 °C). Sin Z no se puede calcular el volumen de las micropipetas.
            </p>
          )}

          {/* --- 1. Micropipetas --- */}
          <Seccion
            id="seccion-micropipetas"
            numero={1}
            titulo="Micropipetas"
            nota="Verificación gravimétrica: tres pesadas por equipo. El volumen se corrige por el factor Z del agua a la temperatura del día."
            resultado={previa.secciones.micropipetas}
            analista={{
              valor: analistaDe(borrador.micropipetas),
              onCambio: (v) =>
                editar((p) => ({ ...p, micropipetas: p.micropipetas.map((m) => ({ ...m, analista: v })) })),
            }}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Peso 1 <span className={styles.unidad}>(mg)</span></th>
                    <th>Peso 2 <span className={styles.unidad}>(mg)</span></th>
                    <th>Peso 3 <span className={styles.unidad}>(mg)</span></th>
                    <th>Vol. medio <span className={styles.unidad}>(µL)</span></th>
                    <th>Desv. <span className={styles.unidad}>(µL)</span></th>
                    <th>Criterio</th>
                    <th>Resultado</th>
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
                        <td>
                          <Calculado valor={calculo?.desviacion ?? null} />
                        </td>
                        <td className={styles.criterio}>± {equipo.tolerancia} µL</td>
                        <td>
                          <Veredicto resultado={calculo?.resultado ?? ''} />
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
            analista={{
              valor: analistaDe(borrador.balanza),
              onCambio: (v) =>
                editar((p) => ({ ...p, balanza: p.balanza.map((b) => ({ ...b, analista: v })) })),
            }}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Pesa patrón</th>
                    <th>Lectura 1</th>
                    <th>Lectura 2</th>
                    <th>Lectura 3</th>
                    <th>Promedio</th>
                    <th>Desviación</th>
                    <th>Criterio</th>
                    <th>Resultado</th>
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
                          <span className={styles.celdaNota}>{pesa.valor_nominal} g nominal</span>
                        </td>
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
                        <td>
                          <Calculado valor={calculo?.desviacion ?? null} decimales={4} />
                        </td>
                        <td className={styles.criterio}>± {pesa.tolerancia} g</td>
                        <td>
                          <Veredicto resultado={calculo?.resultado ?? ''} />
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
            analista={{
              valor: analistaDe(borrador.temperaturas),
              onCambio: (v) =>
                editar((p) => ({ ...p, temperaturas: p.temperaturas.map((t) => ({ ...t, analista: v })) })),
            }}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla} style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Punto de control</th>
                    <th>Lectura <span className={styles.unidad}>(°C)</span></th>
                    <th>Criterio</th>
                    <th>Resultado</th>
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
                      </tr>
                    )
                  })}
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
            analista={{
              valor: analistaDe(borrador.gases),
              onCambio: (v) => editar((p) => ({ ...p, gases: p.gases.map((g) => ({ ...g, analista: v })) })),
            }}
          >
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Gas</th>
                    <th>Código del cilindro</th>
                    <th>P. contenido <span className={styles.unidad}>(psi)</span></th>
                    <th>P. trabajo <span className={styles.unidad}>(psi)</span></th>
                    <th>Resultado</th>
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
                        <td>
                          <input
                            className={styles.input}
                            style={{ width: 140 }}
                            value={g.codigo_cilindro}
                            placeholder="Código"
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
                      </tr>
                    )
                  })}
                  <tr className={cn(previa.resultado_fugas === 'No aceptable' && styles.filaMal)}>
                    <td className={styles.celdaEquipo} colSpan={2}>
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
            resultado={previa.secciones.inyector}
            analista={{
              valor: borrador.inyector.analista,
              onCambio: (v) => editar((p) => ({ ...p, inyector: { ...p.inyector, analista: v } })),
            }}
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
                    <td className={styles.celdaEquipo}>Observaciones del inyector</td>
                    <td>
                      <input
                        className={styles.input}
                        value={borrador.inyector.observaciones}
                        placeholder="Opcional"
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
            resultado={previa.secciones.detector}
            analista={{
              valor: borrador.detector.analista,
              onCambio: (v) => editar((p) => ({ ...p, detector: { ...p.detector, analista: v } })),
            }}
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
                    <td className={styles.celdaEquipo}>Método correcto cargado</td>
                    <td>
                      <SelectorRespuesta
                        valor={borrador.detector.metodo_correcto}
                        onCambio={(v) => editar((p) => ({ ...p, detector: { ...p.detector, metodo_correcto: v } }))}
                      />
                    </td>
                    <td className={styles.criterio}>Sí</td>
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
                <span className={styles.etiqueta}>Observaciones del día</span>
                <textarea
                  className={styles.textarea}
                  value={borrador.observaciones}
                  placeholder="Lo que haya que dejar dicho: una lectura repetida, un equipo que se mandó a calibrar…"
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
                  onChange={(e) => editar((p) => ({ ...p, revisado_por: e.target.value }))}
                />
              </label>
            </Card>
          </div>

          <div className={styles.barraAcciones}>
            <Button onClick={() => void guardar()} disabled={guardando || !sucio}>
              {guardando ? 'Guardando…' : 'Guardar el día'}
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
