import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { IconFrasco } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { useAuth } from '@/features/auth'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import {
  crearSolicitud,
  LABORATORIOS,
  listarAnalitosConfig,
  listarCamposConfig,
  listarLineasProceso,
  listarTiposAplicacion,
} from '@/features/tomaMuestras'
import type { AnalitoConfig, CampoConfig, Laboratorio, OpcionConfig } from '@/features/tomaMuestras'
import { ROUTES } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './NuevaSolicitudView.module.css'

interface AlsPesticida {
  analito: string
  resultado: string
}

const ALS_PESTICIDAS_VACIO: AlsPesticida[] = [
  { analito: '', resultado: '' },
  { analito: '', resultado: '' },
  { analito: '', resultado: '' },
]

/** Agrupa los campos configurables en las secciones visuales del
 * formulario (§5 del rediseño). `observacion` se muestra aparte, en su
 * propia sección de ancho completo. */
const SECCION_DE_CAMPO: Record<string, 'identificacion' | 'cliente' | 'muestreo'> = {
  solicitante: 'identificacion',
  email_solicitante: 'identificacion',
  email_laboratorio: 'identificacion',
  sold_to: 'cliente',
  ship_to: 'cliente',
  especie: 'cliente',
  variedad: 'cliente',
  linea_proceso: 'cliente',
  csg: 'cliente',
  lote: 'cliente',
  producto_utilizado: 'cliente',
  posicion_muestreo: 'muestreo',
  numero_camara: 'muestreo',
  numero_orden: 'muestreo',
  kilos_procesados: 'muestreo',
  tipo_muestra: 'muestreo',
  fecha_muestreo: 'muestreo',
  hora_muestreo: 'muestreo',
  nombre_muestreador: 'muestreo',
}

export function NuevaSolicitudView() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Configuración cargada desde el mantenedor de Toma de muestras.
  const [camposConfig, setCamposConfig] = useState<CampoConfig[] | null>(null)
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  const [lineasProceso, setLineasProceso] = useState<OpcionConfig[]>([])
  const [analitosTodos, setAnalitosTodos] = useState<AnalitoConfig[]>([])

  const [laboratorio, setLaboratorio] = useState<Laboratorio | ''>('')
  const [general, setGeneral] = useState<Record<string, string>>({})
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [lineaProceso, setLineaProceso] = useState('')
  const [tipoAplicacionSel, setTipoAplicacionSel] = useState('')
  const [seleccionAnalitos, setSeleccionAnalitos] = useState<Record<number, boolean>>({})
  const [valoresAnalitos, setValoresAnalitos] = useState<Record<number, string>>({})
  const [alsPesticidas, setAlsPesticidas] = useState<AlsPesticida[]>(ALS_PESTICIDAS_VACIO)

  const [clientesDisponibles, setClientesDisponibles] = useState<string[]>([])
  const [plantasDisponibles, setPlantasDisponibles] = useState<Planta[]>([])

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarCamposConfig()
      .then((campos) => {
        setCamposConfig(campos)
        setGeneral(Object.fromEntries(campos.map((c) => [c.clave, ''])))
      })
      .catch(() => setError('No se pudo cargar la configuración del formulario.'))
    listarTiposAplicacion()
      .then(setTiposAplicacion)
      .catch(() => setTiposAplicacion([]))
    listarLineasProceso()
      .then(setLineasProceso)
      .catch(() => setLineasProceso([]))
    listarAnalitosConfig()
      .then(setAnalitosTodos)
      .catch(() => setAnalitosTodos([]))
    listarClientes()
      .then((clientes) => setClientesDisponibles(clientes.map((c) => c.nombre)))
      .catch(() => setClientesDisponibles([]))
    listarPlantas()
      .then(setPlantasDisponibles)
      .catch(() => setPlantasDisponibles([]))
  }, [])

  const plantasDelCliente = plantasDisponibles.filter((p) => p.cliente_nombre === soldTo)
  const camposActivos = useMemo(
    () => (camposConfig ?? []).filter((c) => c.activo).sort((a, b) => a.orden - b.orden),
    [camposConfig],
  )
  const camposIdentificacion = camposActivos.filter((c) => SECCION_DE_CAMPO[c.clave] === 'identificacion')
  const camposCliente = camposActivos.filter((c) => SECCION_DE_CAMPO[c.clave] === 'cliente')
  const camposMuestreo = camposActivos.filter((c) => SECCION_DE_CAMPO[c.clave] === 'muestreo')
  const campoObservacion = camposActivos.find((c) => c.clave === 'observacion')
  const lineasActivas = lineasProceso.filter((l) => l.activo).sort((a, b) => a.orden - b.orden)
  const tiposActivos = tiposAplicacion.filter((t) => t.activo).sort((a, b) => a.orden - b.orden)
  const analitosLab = useMemo(
    () =>
      analitosTodos
        .filter((a) => a.laboratorio === laboratorio && a.activo)
        .sort((a, b) => a.orden - b.orden),
    [analitosTodos, laboratorio],
  )
  const esCromatografia = laboratorio === 'QUITECA' || laboratorio === 'AGROFRESH'

  function alElegirSoldTo(v: string) {
    setSoldTo(v)
    setShipTo('')
  }

  function alCambiarLaboratorio(v: string) {
    // Al cambiar de laboratorio se descartan los analitos y valores del
    // laboratorio anterior: no deben quedar seleccionados ni enviarse en
    // la solicitud final.
    setLaboratorio(v as Laboratorio | '')
    setSeleccionAnalitos({})
    setValoresAnalitos({})
    setTipoAplicacionSel('')
    setAlsPesticidas(ALS_PESTICIDAS_VACIO)
  }

  function actualizarGeneral(clave: string, valor: string) {
    setGeneral((g) => ({ ...g, [clave]: valor }))
  }

  function alternarAnalito(id: number) {
    setSeleccionAnalitos((actual) => ({ ...actual, [id]: !actual[id] }))
  }

  function valorRequerido(clave: string): string {
    if (clave === 'sold_to') return soldTo
    if (clave === 'ship_to') return shipTo
    if (clave === 'linea_proceso') return lineaProceso
    return general[clave] ?? ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!laboratorio) {
      setError('Selecciona un laboratorio.')
      return
    }
    for (const campo of camposActivos) {
      if (campo.requerido && !valorRequerido(campo.clave).trim()) {
        setError(`"${campo.etiqueta}" es requerido.`)
        return
      }
    }

    const camposLabFinal: Record<string, string> = {}
    for (const analito of analitosLab) {
      if (!seleccionAnalitos[analito.id]) continue
      const valor = valoresAnalitos[analito.id]?.trim()
      const etiqueta = analito.unidad ? `${analito.nombre} (${analito.unidad})` : analito.nombre
      camposLabFinal[etiqueta] = valor || 'Solicitado'
    }
    if (esCromatografia && tipoAplicacionSel) camposLabFinal['Tipo Aplicación'] = tipoAplicacionSel
    if (laboratorio === 'ALS') {
      alsPesticidas.forEach((p, i) => {
        if (p.analito.trim()) camposLabFinal[`Analito Pesticida ${i + 1}`] = p.analito.trim()
        if (p.resultado.trim()) camposLabFinal[`Resultado Pesticida ${i + 1}`] = p.resultado.trim()
      })
    }

    setGuardando(true)
    try {
      await crearSolicitud({
        laboratorio,
        solicitante: general.solicitante?.trim() ?? '',
        sold_to: soldTo.trim(),
        ship_to: shipTo.trim() || null,
        especie: general.especie?.trim() || null,
        variedad: general.variedad?.trim() || null,
        linea_proceso: lineaProceso || null,
        csg: general.csg?.trim() || null,
        lote: general.lote?.trim() || null,
        posicion_muestreo: general.posicion_muestreo?.trim() || null,
        numero_camara: general.numero_camara?.trim() || null,
        numero_orden: general.numero_orden?.trim() || null,
        kilos_procesados: general.kilos_procesados?.trim() ? Number(general.kilos_procesados) : null,
        producto_utilizado: general.producto_utilizado?.trim() || null,
        tipo_muestra: general.tipo_muestra?.trim() || null,
        fecha_muestreo: general.fecha_muestreo || null,
        hora_muestreo: general.hora_muestreo || null,
        nombre_muestreador: general.nombre_muestreador?.trim() || null,
        generado_por: user?.nombre ?? '',
        email_solicitante: general.email_solicitante?.trim() || null,
        email_laboratorio: general.email_laboratorio?.trim() || null,
        observacion: general.observacion?.trim() || null,
        campos_laboratorio: camposLabFinal,
      })
      navigate(ROUTES.tomaMuestras)
    } catch {
      setError('No se pudo crear la solicitud. Revisa que el backend esté corriendo.')
    } finally {
      setGuardando(false)
    }
  }

  function renderCampo(campo: CampoConfig) {
    const etiqueta = (
      <span>
        {campo.etiqueta}
        {campo.requerido && <span className={styles.marcaRequerido}> *</span>}
      </span>
    )

    if (campo.clave === 'sold_to') {
      return (
        <div className={styles.campo} key={campo.clave}>
          <BuscableSelect
            etiqueta={`${campo.etiqueta}${campo.requerido ? ' *' : ''}`}
            opciones={clientesDisponibles}
            valor={soldTo}
            onChange={alElegirSoldTo}
            placeholderTodos="— elegir cliente —"
          />
        </div>
      )
    }
    if (campo.clave === 'ship_to') {
      return (
        <div className={styles.campo} key={campo.clave}>
          <BuscableSelect
            etiqueta={`${campo.etiqueta}${campo.requerido ? ' *' : ''}`}
            opciones={plantasDelCliente.map((p) => p.nombre)}
            valor={shipTo}
            onChange={setShipTo}
            placeholderTodos={soldTo ? '— sin sucursal específica —' : '— elige primero Sold To —'}
            disabled={!soldTo}
          />
        </div>
      )
    }
    if (campo.clave === 'linea_proceso') {
      return (
        <label className={styles.campo} key={campo.clave}>
          {etiqueta}
          <select value={lineaProceso} onChange={(e) => setLineaProceso(e.target.value)}>
            <option value="">— elegir —</option>
            {lineasActivas.map((l) => (
              <option key={l.id} value={l.nombre}>
                {l.nombre}
              </option>
            ))}
          </select>
        </label>
      )
    }
    if (campo.tipo === 'textarea') {
      return (
        <label className={cn(styles.campo, styles.campoAncho)} key={campo.clave}>
          {etiqueta}
          <textarea
            className={styles.textarea}
            rows={3}
            value={general[campo.clave] ?? ''}
            onChange={(e) => actualizarGeneral(campo.clave, e.target.value)}
          />
        </label>
      )
    }
    return (
      <label className={styles.campo} key={campo.clave}>
        {etiqueta}
        <input
          type={campo.tipo}
          value={general[campo.clave] ?? ''}
          onChange={(e) => actualizarGeneral(campo.clave, e.target.value)}
        />
      </label>
    )
  }

  if (camposConfig === null) {
    return (
      <div>
        <Header title="Nueva solicitud" description="Registra una nueva solicitud de muestreo." />
        <Card>
          <p className={styles.estado}>Cargando…</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Nueva solicitud"
        description="Registra una nueva solicitud de muestreo — los campos y análisis disponibles dependen del laboratorio elegido."
      />

      <form onSubmit={onSubmit} className={styles.form}>
        <Card>
          <h2 className={styles.tituloSeccion}>
            <span className={styles.numero}>1</span>
            Información de la solicitud
          </h2>
          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>N° Solicitud</span>
              <input value="Se asigna automáticamente al guardar" disabled />
            </label>
            <label className={styles.campo}>
              <span>Fecha de solicitud</span>
              <input value={formatDateCL(new Date())} disabled />
            </label>
            <label className={styles.campo}>
              <span>
                Laboratorio<span className={styles.marcaRequerido}> *</span>
              </span>
              <select value={laboratorio} onChange={(e) => alCambiarLaboratorio(e.target.value)} required>
                <option value="">— elegir —</option>
                {LABORATORIOS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campo}>
              <span>Generado por</span>
              <input value={user?.nombre ?? ''} disabled />
            </label>
            {camposIdentificacion.map(renderCampo)}
          </div>
        </Card>

        <Card>
          <h2 className={styles.tituloSeccion}>
            <span className={styles.numero}>2</span>
            Cliente, ubicación y producto
          </h2>
          <div className={styles.fila}>{camposCliente.map(renderCampo)}</div>
        </Card>

        <Card>
          <h2 className={styles.tituloSeccion}>
            <span className={styles.numero}>3</span>
            Información del muestreo
          </h2>
          <div className={styles.fila}>{camposMuestreo.map(renderCampo)}</div>
        </Card>

        {laboratorio && (
          <Card>
            <h2 className={styles.tituloSeccionLab}>
              <span className={styles.numero}>4</span>
              <IconFrasco className={styles.iconoLab} />
              Configuración de análisis · {laboratorio}
            </h2>

            {esCromatografia && (
              <label className={styles.campo}>
                <span>Tipo Aplicación</span>
                <select value={tipoAplicacionSel} onChange={(e) => setTipoAplicacionSel(e.target.value)}>
                  <option value="">— elegir —</option>
                  {tiposActivos.map((t) => (
                    <option key={t.id} value={t.nombre}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {analitosLab.length > 0 && (
              <div className={styles.tablaCaja}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Analito</th>
                      <th>Código</th>
                      <th>{esCromatografia ? 'Dosis Aplicada' : 'Valor'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analitosLab.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(seleccionAnalitos[a.id])}
                            onChange={() => alternarAnalito(a.id)}
                          />
                        </td>
                        <td>
                          {a.nombre}
                          {a.requerido && <span className={styles.marcaRequerido}> *</span>}
                        </td>
                        <td className={styles.mono}>{a.codigo}</td>
                        <td>
                          <input
                            type={a.tipo === 'numero' ? 'number' : 'text'}
                            placeholder={a.unidad ?? ''}
                            value={valoresAnalitos[a.id] ?? ''}
                            onChange={(e) => setValoresAnalitos((v) => ({ ...v, [a.id]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {laboratorio === 'ALS' && (
              <div className={styles.tablaCaja}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>Analito Pesticida</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alsPesticidas.map((p, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            value={p.analito}
                            onChange={(e) =>
                              setAlsPesticidas((actual) =>
                                actual.map((it, idx) => (idx === i ? { ...it, analito: e.target.value } : it)),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={p.resultado}
                            onChange={(e) =>
                              setAlsPesticidas((actual) =>
                                actual.map((it, idx) => (idx === i ? { ...it, resultado: e.target.value } : it)),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {campoObservacion && (
          <Card>
            <h2 className={styles.tituloSeccion}>
              <span className={styles.numero}>5</span>
              Observaciones
            </h2>
            <div className={styles.fila}>{renderCampo(campoObservacion)}</div>
          </Card>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.acciones}>
          <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar solicitud'}
          </Button>
        </div>
      </form>
    </div>
  )
}
