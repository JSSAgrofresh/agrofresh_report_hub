import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ROUTES } from '@/constants/routes'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import {
  analizarInformes,
  datosCorreo,
  enviable,
  enviarInforme,
  historialEnvios,
  motivoBloqueo,
  nuevoInforme,
  obtenerEstadoEnvio,
  obtenerPlanDestinatarios,
  sinRepetidos,
  vistaPreviaInforme,
} from '@/features/envioInformes'
import type { EstadoEnvio, Historial, Informe, VistaPrevia } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import { ConfiguracionEnvio } from './ConfiguracionEnvio'
import { DesbloqueoEdicion } from './DesbloqueoEdicion'
import { HistorialEnvios } from './HistorialEnvios'
import { ModoSistema } from './ModoSistema'
import { TarjetaInforme } from './TarjetaInforme'
import { ZonaArchivos } from './ZonaArchivos'
import styles from './EnvioInformes.module.css'

function Paso({ numero, titulo, ayuda, acciones, children }: {
  numero: number; titulo: string; ayuda?: string; acciones?: ReactNode; children: ReactNode
}) {
  return (
    <section className={styles.paso}>
      <header className={styles.pasoCabecera}>
        <span className={styles.pasoNumero} aria-hidden="true">{numero}</span>
        <div className={styles.pasoTextos}>
          <h2 className={styles.pasoTitulo}>{titulo}</h2>
          {ayuda && <p className={styles.pasoAyuda}>{ayuda}</p>}
        </div>
        {acciones}
      </header>
      <div className={styles.pasoCuerpo}>{children}</div>
    </section>
  )
}

function mensajeDe(e: unknown, defecto: string): string {
  return e instanceof HttpError && e.message ? e.message : defecto
}

/**
 * AgroFresh Lab → Envío de informes.
 *
 * Paz sube los PDF que entregó el laboratorio —uno o varios—. De cada uno se leen
 * el Sold To, el Ship To y la especie, y con eso el sistema elige solo la lista de
 * distribución. Cada PDF es un correo aparte, con la plantilla única; si hace
 * falta se corrige solo ese correo. «Enviar todos» los manda de una vez.
 *
 * El laboratorio es siempre AGROFRESH y los datos leídos del PDF no se editan:
 * solo el administrador principal, con su clave, lo habilita.
 *
 * El botón de arriba dice si el sistema está en prueba —todo llega solo a Paz y
 * Jorge— o en producción —llega al cliente—; siempre parte en prueba.
 */
export function EnvioInformesView() {
  const [estado, setEstado] = useState<EstadoEnvio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const [clientes, setClientes] = useState<string[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [informes, setInformes] = useState<Informe[]>([])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [laboratorio, setLaboratorio] = useState('AGROFRESH')

  const [vistaCargada, setVistaCargada] = useState<{ id: string; vista: VistaPrevia } | null>(null)
  const [errorVista, setErrorVista] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Historial | null>(null)

  const peticionPlan = useRef<Record<string, number>>({})

  const recargarHistorial = useCallback(() => {
    historialEnvios()
      .then(setHistorial)
      .catch(() => setHistorial({ disponible: false, items: [] }))
  }, [])

  useEffect(() => {
    obtenerEstadoEnvio()
      .then((e) => {
        setEstado(e)
        setLaboratorio(e.laboratorio_fijo)
      })
      .catch((e) => setError(mensajeDe(e, 'No se pudo cargar el módulo. ¿Tienes acceso a AgroFresh Lab?')))
    listarClientes()
      .then((c) => setClientes(c.filter((x) => x.activo).map((x) => x.nombre)))
      .catch(() => setClientes([]))
    listarPlantas()
      .then((p) => setPlantas(p.filter((x) => x.activo)))
      .catch(() => setPlantas([]))
    recargarHistorial()
  }, [recargarHistorial])

  const actualizar = useCallback((id: string, parcial: Partial<Informe>) => {
    setInformes((lista) => lista.map((i) => (i.id === id ? { ...i, ...parcial } : i)))
  }, [])

  async function agregar(archivos: File[]) {
    const nuevos = sinRepetidos(informes, archivos)
    if (!nuevos.length) return
    setLeyendo(true)
    setError(null)
    setExito(null)
    try {
      const lote = await analizarInformes(nuevos)
      if (!lote.disponible) {
        setError('El servidor todavía no puede leer PDF (falta instalar pypdf). Avísale al administrador.')
      }
      const creados = nuevos.map((archivo, i) => nuevoInforme(archivo, lote.items[i]))
      setInformes((lista) => [...lista, ...creados])
      setSeleccionId((actual) => actual ?? creados[0]?.id ?? null)
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron leer los informes. Intenta de nuevo.'))
    } finally {
      setLeyendo(false)
    }
  }

  function quitar(id: string) {
    setInformes((lista) => lista.filter((i) => i.id !== id))
    setSeleccionId((actual) => (actual === id ? null : actual))
  }

  // Solo con la edición habilitada: otro Sold To / Ship To / especie para ESTE informe.
  function cambiarDatos(id: string, soldTo: string, shipTo: string, especie: string) {
    const inf = informes.find((i) => i.id === id)
    actualizar(id, { soldTo, shipTo, especie })
    if (!inf || !soldTo || !shipTo) return
    const turno = (peticionPlan.current[id] ?? 0) + 1
    peticionPlan.current[id] = turno
    obtenerPlanDestinatarios(soldTo, shipTo, especie, inf.servicio)
      .then((plan) => {
        if (peticionPlan.current[id] !== turno) return
        actualizar(id, { plan, para: plan.to, cc: plan.cc, bcc: plan.bcc })
      })
      .catch((e) => setError(mensajeDe(e, 'No se pudo leer la lista de distribución de esa planta.')))
  }

  const seleccionado = informes.find((i) => i.id === seleccionId) ?? null
  const claveVista = seleccionado
    ? JSON.stringify([seleccionado.id, seleccionado.soldTo, seleccionado.shipTo, seleccionado.especie])
    : ''
  const datosVista = useMemo(
    () => (seleccionado ? datosCorreo(seleccionado, laboratorio) : null),
    [seleccionado, laboratorio],
  )
  const nombreVista = seleccionado?.archivo.name
  const modo = estado?.modo

  // La vista previa la arma el backend con el MISMO código del envío: lo que se
  // ve es lo que sale. Con una pausa para no pedirla por cada letra.
  useEffect(() => {
    if (!datosVista || !nombreVista || !datosVista.sold_to || !datosVista.ship_to) return
    let vigente = true
    const id = seleccionId ?? ''
    const espera = setTimeout(() => {
      vistaPreviaInforme(datosVista, [nombreVista])
        .then((v) => { if (vigente) { setVistaCargada({ id, vista: v }); setErrorVista(null) } })
        .catch((e) => { if (vigente) setErrorVista(mensajeDe(e, 'No se pudo armar la vista previa.')) })
    }, 350)
    return () => { vigente = false; clearTimeout(espera) }
    // claveVista ya resume lo que cambia la plantilla; modo cambia el aviso de prueba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosVista, nombreVista, seleccionId, claveVista, modo])

  const vista = vistaCargada && vistaCargada.id === seleccionId ? vistaCargada.vista : null

  const listos = informes.filter(enviable)
  const pendientes = informes.filter((i) => i.estado !== 'enviado')
  const enProduccion = estado?.modo === 'produccion'
  const hayEnviados = informes.some((i) => i.estado === 'enviado')

  async function enviarTodos() {
    setConfirmando(false)
    setEnviando(true)
    setError(null)
    setExito(null)
    let bien = 0
    let mal = 0
    let ultimo = ''
    for (const inf of informes.filter(enviable)) {
      actualizar(inf.id, { estado: 'enviando', mensaje: null })
      try {
        const r = await enviarInforme(datosCorreo(inf, laboratorio), [inf.archivo])
        bien += 1
        ultimo = r.ok
        actualizar(inf.id, { estado: 'enviado', mensaje: r.ok })
      } catch (e) {
        mal += 1
        actualizar(inf.id, { estado: 'error', mensaje: mensajeDe(e, 'No se pudo enviar este informe.') })
      }
    }
    setEnviando(false)
    recargarHistorial()
    if (bien === 1 && mal === 0) setExito(ultimo)
    else if (bien > 0) setExito(`${bien} ${bien === 1 ? 'informe enviado' : 'informes enviados'}${mal ? `, ${mal} con error` : ''}.`)
    if (mal > 0 && bien === 0) setError('No se pudo enviar ningún informe. Revisa el mensaje de cada uno.')
  }

  const motivos = pendientes.map((i) => motivoBloqueo(i)).filter(Boolean)
  const etiquetaEnviar = enviando
    ? 'Enviando…'
    : enProduccion
      ? `Enviar a clientes${listos.length > 1 ? ` (${listos.length})` : ''}`
      : `Enviar prueba${listos.length > 1 ? ` (${listos.length})` : ''}`

  return (
    <div className={styles.vista}>
      <Header
        title="Envío de informes"
        description="Sube los informes del laboratorio: el sistema lee la planta y los envía a su lista de distribución."
        acciones={
          <>
            <Link to={ROUTES.agrofreshLab} className={styles.volver}>← AgroFresh Lab</Link>
            {estado && <ModoSistema estado={estado} onCambio={setEstado} />}
          </>
        }
      />

      {estado && !enProduccion && (
        <div className={styles.bandaPrueba} role="status">
          <strong>Sistema en prueba.</strong> Todo lo que envíes llega solo a {estado.destinatarios_prueba.join(' y ')}, con
          «(PRUEBA)» en el asunto, y el correo indica a quién habría ido. Nada sale a clientes.
        </div>
      )}
      {estado && enProduccion && (
        <div className={styles.bandaProduccion} role="status">
          <strong>Sistema en producción.</strong> Los envíos llegan a la lista de distribución del cliente.
        </div>
      )}
      {exito && <p className={styles.exito} role="status">{exito}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.espacio}>
        <div className={styles.columna}>
          <Paso
            numero={1}
            titulo="Informes"
            ayuda="Sube uno o varios PDF. Cada uno se envía como un correo aparte."
            acciones={
              <span className={styles.laboratorioFijo} title="Por ahora el laboratorio es siempre AGROFRESH">
                <span aria-hidden="true">🔒</span> Laboratorio: <strong>{laboratorio}</strong>
              </span>
            }
          >
            <ZonaArchivos onAgregar={(a) => void agregar(a)} deshabilitado={enviando} leyendo={leyendo} />
          </Paso>

          {informes.length > 0 && (
            <Paso
              numero={2}
              titulo={`Revisar y enviar (${informes.length})`}
              ayuda="Elige un informe para ver su correo. El Sold To, el Ship To y la especie se leen del PDF para escoger la lista."
              acciones={hayEnviados ? (
                <button
                  type="button"
                  className={styles.enlace}
                  onClick={() => setInformes((l) => l.filter((i) => i.estado !== 'enviado'))}
                >
                  Quitar los enviados
                </button>
              ) : undefined}
            >
              <ul className={styles.informes}>
                {informes.map((inf) => (
                  <TarjetaInforme
                    key={inf.id}
                    informe={inf}
                    seleccionado={inf.id === seleccionId}
                    desbloqueado={desbloqueado}
                    clientes={clientes}
                    plantas={plantas}
                    asuntoBase={inf.id === seleccionId && vista ? vista.asunto_base : ''}
                    textoBase={inf.id === seleccionId && vista ? vista.texto_base : ''}
                    ocupado={enviando}
                    onSeleccionar={() => setSeleccionId(inf.id)}
                    onCambio={(p) => actualizar(inf.id, p)}
                    onDatos={(s, sh, e) => cambiarDatos(inf.id, s, sh, e)}
                    onQuitar={() => quitar(inf.id)}
                    onPedirClave={() => setPidiendoClave(true)}
                  />
                ))}
              </ul>
            </Paso>
          )}
        </div>

        <aside className={styles.columnaDer} aria-label="Vista previa del correo">
          <div className={styles.vistaPrevia}>
            <header className={styles.vistaCabecera}>
              <h2>Vista previa</h2>
              <span className={`${styles.etiquetaModo} ${enProduccion ? styles.etiquetaProduccion : styles.etiquetaPrueba}`}>
                {enProduccion ? 'Producción' : 'Prueba'}
              </span>
            </header>
            {vista && seleccionado ? (
              <>
                <dl className={styles.cabecerasCorreo}>
                  <dt>Para</dt><dd>{vista.efectivos.to.join(', ') || '—'}</dd>
                  {vista.efectivos.cc.length > 0 && (<><dt>CC</dt><dd>{vista.efectivos.cc.join(', ')}</dd></>)}
                  {vista.efectivos.bcc.length > 0 && (<><dt>CCO</dt><dd>{vista.efectivos.bcc.join(', ')}</dd></>)}
                  <dt>Asunto</dt><dd className={styles.asuntoVista}>{vista.asunto}</dd>
                  <dt>Adjunto</dt><dd>{seleccionado.archivo.name}</dd>
                </dl>
                <iframe
                  className={styles.marcoCorreo}
                  title="Vista previa del correo"
                  sandbox=""
                  srcDoc={vista.html}
                />
              </>
            ) : (
              <p className={styles.vacio}>
                {errorVista ?? (informes.length
                  ? 'Elige un informe para ver cómo saldrá su correo.'
                  : 'Sube un informe para ver cómo saldrá el correo.')}
              </p>
            )}
          </div>

          <div className={styles.barraEnvio}>
            <div className={styles.resumenEnvio}>
              {listos.length > 0 ? (
                <p>
                  {enProduccion ? 'Saldrán ' : 'Se probarán '}
                  <strong>{listos.length} {listos.length === 1 ? 'informe' : 'informes'}</strong>
                  {pendientes.length > listos.length && (
                    <span className={styles.faltan}> · {pendientes.length - listos.length} sin revisar</span>
                  )}
                </p>
              ) : (
                <p className={styles.faltan}>
                  {informes.length === 0
                    ? 'Para enviar: sube al menos un informe.'
                    : motivos[0] ?? 'No hay informes listos para enviar.'}
                </p>
              )}
            </div>
            <Button
              onClick={() => (enProduccion ? setConfirmando(true) : void enviarTodos())}
              disabled={listos.length === 0 || enviando || !estado}
              className={styles.botonEnviar}
            >
              {etiquetaEnviar}
            </Button>
          </div>
        </aside>
      </div>

      {estado && (
        <details className={styles.plegable}>
          <summary>Configuración: plantilla del correo y copias internas</summary>
          <ConfiguracionEnvio
            estado={estado}
            laboratorio={laboratorio}
            bloqueado={!desbloqueado}
            onLaboratorio={setLaboratorio}
            onEstado={setEstado}
            onPedirClave={() => setPidiendoClave(true)}
          />
        </details>
      )}

      <section className={styles.historial}>
        <h2>Últimos envíos</h2>
        <HistorialEnvios historial={historial} />
      </section>

      {pidiendoClave && (
        <DesbloqueoEdicion
          onCerrar={() => setPidiendoClave(false)}
          onDesbloqueado={() => { setDesbloqueado(true); setPidiendoClave(false) }}
        />
      )}

      {confirmando && (
        <Modal
          titulo={`Enviar ${listos.length === 1 ? 'a clientes' : `${listos.length} informes a clientes`}`}
          subtitulo="El sistema está en producción: cada correo llegará a las personas que se indican."
          onCerrar={() => setConfirmando(false)}
          pie={
            <>
              <Button variant="secondary" onClick={() => setConfirmando(false)}>Cancelar</Button>
              <Button onClick={() => void enviarTodos()}>Enviar a clientes</Button>
            </>
          }
        >
          <ul className={styles.resumenConfirmacion}>
            {listos.map((i) => (
              <li key={i.id}>
                <strong>{i.shipTo}</strong> <span className={styles.celdaSub}>{i.soldTo}{i.especie ? ` · ${i.especie}` : ''}</span>
                <span className={styles.confirmaPara}>Para: {i.para.join(', ')}</span>
                {i.cc.length > 0 && <span className={styles.confirmaPara}>CC: {i.cc.join(', ')}</span>}
                {i.bcc.length > 0 && <span className={styles.confirmaPara}>CCO: {i.bcc.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}
