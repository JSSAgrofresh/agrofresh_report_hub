import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { IconFrasco } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import { useAuth } from '@/features/auth'
import { listarEspeciesActivas, listarVariedadesActivasDeEspecie } from '@/features/listados'
import type { ValorLista } from '@/features/listados'
import {
  crearSolicitud,
  listarAnalitosConfig,
  listarCamposConfig,
  listarCamposTipoAplicacion,
  listarLaboratoriosConfig,
  listarProductosConfig,
  listarTiposAplicacion,
} from '@/features/tomaMuestras'
import type {
  AnalitoConfig,
  CampoConfig,
  CampoTipoAplicacionConfig,
  LaboratorioConfig,
  OpcionConfig,
  ProductoConfig,
} from '@/features/tomaMuestras'
import { ROUTES } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './NuevaSolicitudView.module.css'

const SOLICITANTE_FIJO = 'AGROFRESH'

const TIPO_LINEA_PROCESO = 'Línea de proceso'
const TIPO_ACTIMIST = 'Actimist'

/** Tipo de Muestra es una lista cerrada: el laboratorio procesa estas tres
 * matrices y nada más. Antes era texto libre y llegaban variantes ("fruta",
 * "Fruta ", "FRUTA") que había que homogenizar después. */
const TIPOS_DE_MUESTRA = ['Fruta', 'Agua', 'Cera']

/** Campos que solo son obligatorios dentro de un Tipo de Aplicación. El
 * mantenedor de campos generales solo tiene un sí/no global, así que estas
 * dos reglas se resuelven acá y se ignora su `requerido` configurado. */
const REQUERIDO_SOLO_EN: Record<string, string> = {
  csg: TIPO_LINEA_PROCESO,
  posicion_muestreo: TIPO_ACTIMIST,
}

/** Obligatorios pase lo que pase, sin importar el Tipo de Aplicación. */
const SIEMPRE_REQUERIDO = new Set(['fecha_muestreo'])

/** Nunca obligatorio, aunque el mantenedor lo marque. */
const NUNCA_REQUERIDO = new Set(['kilos_procesados'])

interface AlsPesticida {
  analito: string
  resultado: string
}

const ALS_PESTICIDAS_VACIO: AlsPesticida[] = [
  { analito: '', resultado: '' },
  { analito: '', resultado: '' },
  { analito: '', resultado: '' },
]

/** Campos de "Información de la muestra" comunes a cualquier Tipo de
 * Aplicación (§4). Línea Proceso / N° Cámara+N° Orden son exclusivos de
 * cada caso y se resuelven aparte. */
const SECCION_DE_CAMPO: Record<string, 'identificacion' | 'muestra'> = {
  email_solicitante: 'identificacion',
  sold_to: 'identificacion',
  ship_to: 'identificacion',
  especie: 'muestra',
  variedad: 'muestra',
  linea_proceso: 'muestra',
  numero_camara: 'muestra',
  numero_orden: 'muestra',
  csg: 'muestra',
  lote: 'muestra',
  kilos_procesados: 'muestra',
  posicion_muestreo: 'muestra',
  producto_utilizado: 'muestra',
  tipo_muestra: 'muestra',
  fecha_muestreo: 'muestra',
  hora_muestreo: 'muestra',
  nombre_muestreador: 'muestra',
}

export function NuevaSolicitudView() {
  const navigate = useNavigate()

  // Configuración cargada desde el mantenedor de Toma de muestras.
  const [camposConfig, setCamposConfig] = useState<CampoConfig[] | null>(null)
  const [laboratoriosConfig, setLaboratoriosConfig] = useState<LaboratorioConfig[]>([])
  const [tiposAplicacion, setTiposAplicacion] = useState<OpcionConfig[]>([])
  const [analitosTodos, setAnalitosTodos] = useState<AnalitoConfig[]>([])
  const [productosTodos, setProductosTodos] = useState<ProductoConfig[]>([])
  const [camposTipoAplicacion, setCamposTipoAplicacion] = useState<CampoTipoAplicacionConfig[]>([])

  const { user } = useAuth()

  // El correo del solicitante es siempre el de la cuenta que está creando la
  // solicitud: es a quien hay que responder. No se guarda en el estado del
  // formulario porque no se edita — se deriva de la sesión.
  const emailCuenta = user?.email ?? ''

  const [laboratorio, setLaboratorio] = useState('')
  // "Generado por" arranca con el nombre de la cuenta pero sigue siendo
  // editable: quien registra puede estar cargando la solicitud de otra
  // persona del equipo.
  const [generadoPor, setGeneradoPor] = useState(() => user?.nombre ?? '')
  const [tipoAplicacionSel, setTipoAplicacionSel] = useState('')
  const [general, setGeneral] = useState<Record<string, string>>({})
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [lineaProceso, setLineaProceso] = useState('')
  // Una aplicación puede llevar más de un producto, así que la selección es
  // múltiple. Se guarda como lista y se envía unida por coma para no cambiar
  // el formato de `producto_utilizado` que ya leen el Excel y el informe.
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([])
  const [valoresTipoAplicacion, setValoresTipoAplicacion] = useState<Record<string, string>>({})
  const [seleccionAnalitos, setSeleccionAnalitos] = useState<Record<number, boolean>>({})
  const [valoresAnalitos, setValoresAnalitos] = useState<Record<number, string>>({})
  const [alsPesticidas, setAlsPesticidas] = useState<AlsPesticida[]>(ALS_PESTICIDAS_VACIO)

  const [clientesDisponibles, setClientesDisponibles] = useState<string[]>([])
  const [plantasDisponibles, setPlantasDisponibles] = useState<Planta[]>([])
  const [especiesDisponibles, setEspeciesDisponibles] = useState<ValorLista[]>([])
  const [variedadesDisponibles, setVariedadesDisponibles] = useState<string[]>([])

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarCamposConfig()
      .then((campos) => {
        setCamposConfig(campos)
        setGeneral(Object.fromEntries(campos.map((c) => [c.clave, ''])))
      })
      .catch(() => setError('No se pudo cargar la configuración del formulario.'))
    listarLaboratoriosConfig()
      .then(setLaboratoriosConfig)
      .catch(() => setLaboratoriosConfig([]))
    listarTiposAplicacion()
      .then(setTiposAplicacion)
      .catch(() => setTiposAplicacion([]))
    listarAnalitosConfig()
      .then(setAnalitosTodos)
      .catch(() => setAnalitosTodos([]))
    listarProductosConfig()
      .then(setProductosTodos)
      .catch(() => setProductosTodos([]))
    listarCamposTipoAplicacion()
      .then(setCamposTipoAplicacion)
      .catch(() => setCamposTipoAplicacion([]))
    listarClientes()
      .then((clientes) => setClientesDisponibles(clientes.filter((c) => c.activo).map((c) => c.nombre)))
      .catch(() => setClientesDisponibles([]))
    listarPlantas()
      .then((plantas) => setPlantasDisponibles(plantas.filter((p) => p.activo)))
      .catch(() => setPlantasDisponibles([]))
    listarEspeciesActivas()
      .then(setEspeciesDisponibles)
      .catch(() => setEspeciesDisponibles([]))
  }, [])

  const plantasDelCliente = plantasDisponibles.filter((p) => p.cliente_nombre === soldTo)
  const laboratoriosActivos = laboratoriosConfig.filter((l) => l.activo).sort((a, b) => a.orden - b.orden)
  const tiposActivos = tiposAplicacion.filter((t) => t.activo).sort((a, b) => a.orden - b.orden)

  const camposActivos = useMemo(
    () => (camposConfig ?? []).filter((c) => c.activo).sort((a, b) => a.orden - b.orden),
    [camposConfig],
  )
  const camposIdentificacion = camposActivos.filter((c) => SECCION_DE_CAMPO[c.clave] === 'identificacion')
  const camposMuestraVisibles = useMemo(
    () =>
      camposActivos.filter((c) => {
        if (SECCION_DE_CAMPO[c.clave] !== 'muestra') return false
        // Kilos procesados y CSG son datos de la línea: en Actimist se
        // muestrea de una cámara, no de un flujo de proceso.
        if (c.clave === 'linea_proceso' || c.clave === 'kilos_procesados' || c.clave === 'csg') {
          return tipoAplicacionSel === TIPO_LINEA_PROCESO
        }
        if (c.clave === 'numero_camara' || c.clave === 'numero_orden') return tipoAplicacionSel === TIPO_ACTIMIST
        return true
      }),
    [camposActivos, tipoAplicacionSel],
  )
  const campoObservacion = camposActivos.find((c) => c.clave === 'observacion')

  const productosDisponibles = useMemo(
    () => productosTodos.filter((p) => p.laboratorio === laboratorio && p.activo && (!p.tipo_aplicacion || p.tipo_aplicacion === tipoAplicacionSel)),
    [productosTodos, laboratorio, tipoAplicacionSel],
  )
  const analitosLab = useMemo(
    () =>
      analitosTodos
        .filter(
          (a) =>
            a.laboratorio === laboratorio &&
            a.activo &&
            (!a.tipo_aplicacion || a.tipo_aplicacion === tipoAplicacionSel),
        )
        .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.orden - b.orden),
    [analitosTodos, laboratorio, tipoAplicacionSel],
  )
  const esCromatografia = laboratorio === 'QUITECA' || laboratorio === 'AGROFRESH'
  const esLineaProceso = tipoAplicacionSel === TIPO_LINEA_PROCESO
  const esActimist = tipoAplicacionSel === TIPO_ACTIMIST
  const camposTipoAplicacionActivos = useMemo(
    () =>
      camposTipoAplicacion
        .filter((c) => c.activo && (c.ambito === 'comun' || c.ambito === tipoAplicacionSel))
        .sort((a, b) => (a.ambito !== 'comun' ? 1 : 0) - (b.ambito !== 'comun' ? 1 : 0) || a.orden - b.orden),
    [camposTipoAplicacion, tipoAplicacionSel],
  )

  function alElegirSoldTo(v: string) {
    setSoldTo(v)
    setShipTo('')
  }

  function alElegirEspecie(v: string) {
    // Variedad depende de la Especie -"June Gold" de Durazno y "June Gold"
    // de Manzana son variedades distintas-, así que al cambiar de especie
    // hay que recargar las variedades disponibles y descartar la elegida.
    setGeneral((g) => ({ ...g, especie: v, variedad: '' }))
    setVariedadesDisponibles([])
    const especie = especiesDisponibles.find((e) => e.valor === v)
    if (especie) {
      listarVariedadesActivasDeEspecie(especie.id)
        .then(setVariedadesDisponibles)
        .catch(() => setVariedadesDisponibles([]))
    }
  }

  function alCambiarLaboratorio(v: string) {
    // Al cambiar de laboratorio se descartan los analitos, producto y
    // valores del laboratorio anterior: no deben quedar seleccionados ni
    // enviarse en la solicitud final.
    setLaboratorio(v)
    setSeleccionAnalitos({})
    setValoresAnalitos({})
    setProductosSeleccionados([])
    setAlsPesticidas(ALS_PESTICIDAS_VACIO)
  }

  function alCambiarTipoAplicacion(v: string) {
    // Igual que con el laboratorio: los campos propios del Tipo de
    // Aplicación anterior (Línea Proceso vs N° Cámara/N° Orden, campos
    // adicionales, analitos y producto) no deben quedar con valores de un
    // tipo que ya no aplica.
    setTipoAplicacionSel(v)
    setValoresTipoAplicacion({})
    setLineaProceso('')
    setProductosSeleccionados([])
    setSeleccionAnalitos({})
    setValoresAnalitos({})
    setGeneral((g) => ({ ...g, numero_camara: '', numero_orden: '', csg: '', kilos_procesados: '' }))
  }

  function actualizarGeneral(clave: string, valor: string) {
    setGeneral((g) => ({ ...g, [clave]: valor }))
  }

  function alternarAnalito(id: number) {
    setSeleccionAnalitos((actual) => ({ ...actual, [id]: !actual[id] }))
  }

  function valorRequerido(clave: string): string {
    if (clave === 'email_solicitante') return emailCuenta
    if (clave === 'sold_to') return soldTo
    if (clave === 'ship_to') return shipTo
    if (clave === 'linea_proceso') return lineaProceso
    if (clave === 'producto_utilizado') return productosSeleccionados.join(', ')
    return general[clave] ?? ''
  }

  /** Obligatoriedad efectiva de un campo: las reglas por Tipo de Aplicación
   * mandan sobre el sí/no configurado en el mantenedor. */
  function esRequerido(campo: CampoConfig): boolean {
    if (NUNCA_REQUERIDO.has(campo.clave)) return false
    if (SIEMPRE_REQUERIDO.has(campo.clave)) return true
    const soloEn = REQUERIDO_SOLO_EN[campo.clave]
    if (soloEn) return tipoAplicacionSel === soloEn
    return campo.requerido
  }

  function alternarProducto(nombre: string) {
    setProductosSeleccionados((actual) =>
      actual.includes(nombre) ? actual.filter((p) => p !== nombre) : [...actual, nombre],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!laboratorio) {
      setError('Selecciona un laboratorio.')
      return
    }
    if (!tipoAplicacionSel) {
      setError('Selecciona un Tipo de Aplicación.')
      return
    }
    if (!generadoPor.trim()) {
      setError('"Generado por" es requerido.')
      return
    }
    for (const campo of [...camposIdentificacion, ...camposMuestraVisibles]) {
      if (esRequerido(campo) && !valorRequerido(campo.clave).trim()) {
        setError(`"${campo.etiqueta}" es requerido.`)
        return
      }
    }

    const codigosAnalitosSolicitados: string[] = []
    const camposLabFinal: Record<string, string> = { 'Tipo Aplicación': tipoAplicacionSel }
    for (const analito of analitosLab) {
      if (!seleccionAnalitos[analito.id]) continue
      codigosAnalitosSolicitados.push(analito.codigo)
      const valor = valoresAnalitos[analito.id]?.trim()
      const etiqueta = analito.unidad ? `${analito.nombre} (${analito.unidad})` : analito.nombre
      camposLabFinal[etiqueta] = valor || 'Solicitado'
    }
    // Los campos propios del Tipo de Aplicación se guardan siempre que
    // apliquen, aunque estén vacíos: el informe debe mostrar la estructura
    // completa configurada, no solo lo que tiene valor (a diferencia de los
    // analitos, que son estrictamente opt-in).
    for (const campo of camposTipoAplicacionActivos) {
      camposLabFinal[campo.etiqueta] = (valoresTipoAplicacion[campo.clave] ?? '').trim()
    }
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
        solicitante: SOLICITANTE_FIJO,
        sold_to: soldTo.trim(),
        ship_to: shipTo.trim() || null,
        especie: general.especie?.trim() || null,
        variedad: general.variedad?.trim() || null,
        linea_proceso: esLineaProceso ? lineaProceso || null : null,
        // CSG y kilos son propios de la línea: en Actimist ni se piden ni se
        // guardan, aunque hayan quedado escritos antes de cambiar de tipo.
        csg: esLineaProceso ? general.csg?.trim() || null : null,
        lote: general.lote?.trim() || null,
        posicion_muestreo: general.posicion_muestreo?.trim() || null,
        numero_camara: esActimist ? general.numero_camara?.trim() || null : null,
        numero_orden: esActimist ? general.numero_orden?.trim() || null : null,
        kilos_procesados:
          esLineaProceso && general.kilos_procesados?.trim() ? Number(general.kilos_procesados) : null,
        producto_utilizado: productosSeleccionados.join(', ') || null,
        tipo_muestra: general.tipo_muestra?.trim() || null,
        fecha_muestreo: general.fecha_muestreo || null,
        hora_muestreo: general.hora_muestreo || null,
        nombre_muestreador: general.nombre_muestreador?.trim() || null,
        generado_por: generadoPor.trim(),
        email_solicitante: emailCuenta.trim() || null,
        email_laboratorio: general.email_laboratorio?.trim() || null,
        observacion: general.observacion?.trim() || null,
        campos_laboratorio: camposLabFinal,
        analitos_solicitados: codigosAnalitosSolicitados,
      })
      navigate(ROUTES.tomaMuestras)
    } catch {
      setError('No se pudo crear la solicitud. Revisa que el backend esté corriendo.')
    } finally {
      setGuardando(false)
    }
  }

  function renderCampo(campo: CampoConfig) {
    const requerido = esRequerido(campo)
    const etiqueta = (
      <span>
        {campo.etiqueta}
        {requerido && <span className={styles.marcaRequerido}> *</span>}
      </span>
    )

    if (campo.clave === 'email_solicitante') {
      return (
        <label className={styles.campo} key={campo.clave}>
          {etiqueta}
          <input value={emailCuenta} readOnly disabled />
          <small className={styles.ayudaCampo}>Es el correo de tu cuenta.</small>
        </label>
      )
    }
    if (campo.clave === 'tipo_muestra') {
      return (
        <label className={styles.campo} key={campo.clave}>
          {etiqueta}
          <select
            value={general.tipo_muestra ?? ''}
            onChange={(e) => actualizarGeneral('tipo_muestra', e.target.value)}
          >
            <option value="">— elegir —</option>
            {TIPOS_DE_MUESTRA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )
    }
    if (campo.clave === 'sold_to') {
      return (
        <div className={styles.campo} key={campo.clave}>
          <BuscableSelect
            etiqueta={`${campo.etiqueta}${requerido ? ' *' : ''}`}
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
            etiqueta={`${campo.etiqueta}${requerido ? ' *' : ''}`}
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
          <input value={lineaProceso} onChange={(e) => setLineaProceso(e.target.value)} placeholder="Ej. Línea 1" />
        </label>
      )
    }
    if (campo.clave === 'especie') {
      return (
        <div className={styles.campo} key={campo.clave}>
          <BuscableSelect
            etiqueta={`${campo.etiqueta}${requerido ? ' *' : ''}`}
            opciones={especiesDisponibles.map((e) => e.valor)}
            valor={general.especie ?? ''}
            onChange={alElegirEspecie}
            placeholderTodos="— elegir especie —"
          />
        </div>
      )
    }
    if (campo.clave === 'variedad') {
      return (
        <div className={styles.campo} key={campo.clave}>
          <BuscableSelect
            etiqueta={`${campo.etiqueta}${requerido ? ' *' : ''}`}
            opciones={variedadesDisponibles}
            valor={general.variedad ?? ''}
            onChange={(v) => actualizarGeneral('variedad', v)}
            placeholderTodos={general.especie ? '— elegir variedad —' : '— elige primero Especie —'}
            disabled={!general.especie}
          />
        </div>
      )
    }
    if (campo.clave === 'producto_utilizado') {
      return (
        <div className={cn(styles.campo, styles.campoAncho)} key={campo.clave}>
          {etiqueta}
          {productosDisponibles.length === 0 ? (
            <p className={styles.ayudaCampo}>
              No hay productos configurados para {laboratorio || 'este laboratorio'}
              {tipoAplicacionSel ? ` en ${tipoAplicacionSel}` : ''}. Se configuran en Ajustes de la solicitud.
            </p>
          ) : (
            <div className={styles.listaChecks}>
              {productosDisponibles.map((p) => (
                <label className={styles.itemCheck} key={p.id}>
                  <input
                    type="checkbox"
                    checked={productosSeleccionados.includes(p.nombre)}
                    onChange={() => alternarProducto(p.nombre)}
                  />
                  <span>{p.nombre}</span>
                </label>
              ))}
            </div>
          )}
        </div>
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
        <Header title="Nueva solicitud" description="Registra una nueva solicitud de análisis." />
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
        description="Registra una nueva solicitud de análisis — los campos y análisis disponibles dependen del laboratorio y el tipo de aplicación."
      />

      <form onSubmit={onSubmit} className={styles.form}>
        <Card>
          <h2 className={styles.tituloSeccion}>
            <span className={styles.numero}>1</span>
            Identificación de la solicitud
          </h2>
          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>N° Solicitud</span>
              <input value="Se asigna automáticamente al guardar" disabled />
            </label>
            <label className={styles.campo}>
              <span>Fecha</span>
              <input value={formatDateCL(new Date())} disabled />
            </label>
            <label className={styles.campo}>
              <span>
                Generado por<span className={styles.marcaRequerido}> *</span>
              </span>
              <input
                value={generadoPor}
                onChange={(e) => setGeneradoPor(e.target.value)}
                placeholder="Nombre de quien genera la solicitud"
                required
              />
            </label>
            <label className={styles.campo}>
              <span>
                Laboratorio<span className={styles.marcaRequerido}> *</span>
              </span>
              <select value={laboratorio} onChange={(e) => alCambiarLaboratorio(e.target.value)} required>
                <option value="">— elegir —</option>
                {laboratoriosActivos.map((l) => (
                  <option key={l.id} value={l.codigo}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campo}>
              <span>
                Tipo de Aplicación<span className={styles.marcaRequerido}> *</span>
              </span>
              <select value={tipoAplicacionSel} onChange={(e) => alCambiarTipoAplicacion(e.target.value)} required>
                <option value="">— elegir —</option>
                {tiposActivos.map((t) => (
                  <option key={t.id} value={t.nombre}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campo}>
              <span>Solicitante</span>
              <input value={SOLICITANTE_FIJO} disabled />
            </label>
            {camposIdentificacion.map(renderCampo)}
          </div>
        </Card>

        <Card>
          <h2 className={styles.tituloSeccion}>
            <span className={styles.numero}>2</span>
            Información de la muestra
          </h2>
          {tipoAplicacionSel ? (
            <div className={styles.fila}>{camposMuestraVisibles.map(renderCampo)}</div>
          ) : (
            <p className={styles.estado}>Elige un Tipo de Aplicación para ver los campos de la muestra.</p>
          )}
        </Card>

        {laboratorio && tipoAplicacionSel && (
          <Card>
            <h2 className={styles.tituloSeccionLab}>
              <span className={styles.numero}>3</span>
              <IconFrasco className={styles.iconoLab} />
              Análisis · Solicitados · {laboratorio}
            </h2>

            {camposTipoAplicacionActivos.length > 0 && (
              <div className={styles.fila}>
                {camposTipoAplicacionActivos.map((campo) => (
                  <label className={styles.campo} key={campo.clave}>
                    <span>
                      {campo.etiqueta}
                      {campo.requerido && <span className={styles.marcaRequerido}> *</span>}
                    </span>
                    <input
                      type={campo.tipo}
                      value={valoresTipoAplicacion[campo.clave] ?? ''}
                      onChange={(e) => setValoresTipoAplicacion((v) => ({ ...v, [campo.clave]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}

            {analitosLab.length > 0 && (
              <div className={styles.tablaCaja}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Código</th>
                      <th>Analito</th>
                      <th>{esCromatografia ? 'Dosis Aplicada' : 'Valor'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analitosLab.map((a, i) => {
                      const nuevaCategoria = a.categoria && a.categoria !== analitosLab[i - 1]?.categoria
                      return (
                        <Fragment key={a.id}>
                          {nuevaCategoria && (
                            <tr>
                              <td colSpan={4} className={styles.categoriaFila}>
                                {a.categoria}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td>
                              <input
                                type="checkbox"
                                checked={Boolean(seleccionAnalitos[a.id])}
                                onChange={() => alternarAnalito(a.id)}
                              />
                            </td>
                            <td className={styles.mono}>{a.codigo}</td>
                            <td>
                              {a.nombre}
                              {a.requerido && <span className={styles.marcaRequerido}> *</span>}
                            </td>
                            <td>
                              {/* Siempre texto libre: acá se anota lo que
                                  corresponda al analito (una dosis, una
                                  unidad distinta, una nota), no solo un
                                  número en la unidad configurada. */}
                              <input
                                type="text"
                                placeholder={a.unidad ?? ''}
                                value={valoresAnalitos[a.id] ?? ''}
                                onChange={(e) => setValoresAnalitos((v) => ({ ...v, [a.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
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
              <span className={styles.numero}>4</span>
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
