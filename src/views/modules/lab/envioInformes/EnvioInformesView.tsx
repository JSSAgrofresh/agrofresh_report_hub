import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { Modal } from '@/components/ui/Modal'
import { ROUTES } from '@/constants/routes'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import {
  enviarInforme,
  esCorreoValido,
  historialEnvios,
  obtenerEstadoEnvio,
  obtenerPlanDestinatarios,
  vistaPreviaInforme,
} from '@/features/envioInformes'
import type {
  DatosCorreo,
  EstadoEnvio,
  Historial,
  PlanDestinatarios,
  VistaPrevia,
} from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import { ConfiguracionEnvio } from './ConfiguracionEnvio'
import { HistorialEnvios } from './HistorialEnvios'
import { ListaCorreos } from './ListaCorreos'
import { ModoSistema } from './ModoSistema'
import { ZonaArchivos } from './ZonaArchivos'
import styles from './EnvioInformes.module.css'

function Paso({ numero, titulo, ayuda, children }: { numero: number; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className={styles.paso}>
      <header className={styles.pasoCabecera}>
        <span className={styles.pasoNumero} aria-hidden="true">{numero}</span>
        <div>
          <h2 className={styles.pasoTitulo}>{titulo}</h2>
          {ayuda && <p className={styles.pasoAyuda}>{ayuda}</p>}
        </div>
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
 * Paz sube el PDF que entregó el laboratorio, elige Sold To y Ship To, y el
 * sistema propone la lista de distribución del cliente (la de Resultado a
 * clientes de esa planta). Todo se puede corregir antes de enviar. El botón de
 * arriba dice si el sistema está en prueba —todo llega solo a Paz y Jorge— o en
 * producción —llega al cliente—; siempre parte en prueba.
 */
export function EnvioInformesView() {
  const [estado, setEstado] = useState<EstadoEnvio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const [laboratorio, setLaboratorio] = useState('')
  const [clientes, setClientes] = useState<string[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [especie, setEspecie] = useState('')
  // La lista propuesta se guarda con la combinación para la que se pidió: así
  // «cargando» y «sin plan» se deducen, sin tocar estado dentro del efecto.
  const [planCargado, setPlanCargado] = useState<{ clave: string; plan: PlanDestinatarios } | null>(null)

  const [para, setPara] = useState<string[]>([])
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [asuntoManual, setAsuntoManual] = useState<string | null>(null)
  const [cuerpoManual, setCuerpoManual] = useState<string | null>(null)

  const [vistaCargada, setVistaCargada] = useState<{ clave: string; vista: VistaPrevia } | null>(null)
  const [errorVista, setErrorVista] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [historial, setHistorial] = useState<Historial | null>(null)

  const recargarHistorial = useCallback(() => {
    historialEnvios()
      .then(setHistorial)
      .catch(() => setHistorial({ disponible: false, items: [] }))
  }, [])

  useEffect(() => {
    obtenerEstadoEnvio()
      .then((e) => {
        setEstado(e)
        setLaboratorio((actual) => actual || (e.laboratorios.includes('QUITECA') ? 'QUITECA' : e.laboratorios[0] ?? ''))
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

  const plantasDelCliente = useMemo(
    () => plantas.filter((p) => p.cliente_nombre === soldTo).map((p) => p.nombre),
    [plantas, soldTo],
  )

  // Las copias internas viajan en la lista propuesta: si cambian (y solo si cambian),
  // se vuelve a pedir. Cambiar de modo no debe borrar lo que Paz ya editó.
  const claveInternos = JSON.stringify(estado?.internos ?? null)

  const clavePlan = soldTo && shipTo ? JSON.stringify([soldTo, shipTo, especie, claveInternos]) : ''
  const plan = planCargado && planCargado.clave === clavePlan ? planCargado.plan : null
  const cargandoPlan = !!clavePlan && !plan

  // La lista que propone el sistema para esta planta y especie.
  useEffect(() => {
    if (!clavePlan) return
    let vigente = true
    obtenerPlanDestinatarios(soldTo, shipTo, especie)
      .then((p) => {
        if (!vigente) return
        setPlanCargado({ clave: clavePlan, plan: p })
        setPara(p.to)
        setCc(p.cc)
        setBcc(p.bcc)
        // Una planta con una sola lista, y por especie: no hay nada que elegir.
        if (!especie && p.to.length === 0 && p.especies.length === 1) setEspecie(p.especies[0])
      })
      .catch((e) => {
        if (vigente) setError(mensajeDe(e, 'No se pudo leer la lista de distribución de esta planta.'))
      })
    return () => { vigente = false }
  }, [clavePlan, soldTo, shipTo, especie])

  const nombresArchivos = useMemo(() => archivos.map((a) => a.name), [archivos])

  const datos: DatosCorreo = useMemo(
    () => ({
      laboratorio, sold_to: soldTo, ship_to: shipTo, especie,
      asunto: asuntoManual, cuerpo: cuerpoManual, para, cc, bcc,
    }),
    [laboratorio, soldTo, shipTo, especie, asuntoManual, cuerpoManual, para, cc, bcc],
  )

  // La vista previa se pide al backend: es el MISMO armado que usa el envío,
  // así que lo que se ve es lo que sale. Con una pausa para no pedirla por cada letra.
  const modo = estado?.modo
  const claveVista = laboratorio && soldTo && shipTo ? JSON.stringify([laboratorio, soldTo, shipTo]) : ''
  const vista = vistaCargada && vistaCargada.clave === claveVista ? vistaCargada.vista : null
  useEffect(() => {
    if (!claveVista) return
    let vigente = true
    const espera = setTimeout(() => {
      vistaPreviaInforme(datos, nombresArchivos)
        .then((v) => { if (vigente) { setVistaCargada({ clave: claveVista, vista: v }); setErrorVista(null) } })
        .catch((e) => { if (vigente) setErrorVista(mensajeDe(e, 'No se pudo armar la vista previa.')) })
    }, 350)
    return () => { vigente = false; clearTimeout(espera) }
  }, [datos, nombresArchivos, claveVista, modo])

  function vaciarDestinatarios() {
    setPara([])
    setCc([])
    setBcc([])
  }

  function elegirSoldTo(valor: string) {
    setSoldTo(valor)
    setShipTo('')
    setEspecie('')
    vaciarDestinatarios()
    setAsuntoManual(null)
    setCuerpoManual(null)
  }

  function elegirShipTo(valor: string) {
    setShipTo(valor)
    setEspecie('')
    vaciarDestinatarios()
  }

  const correosMalos = [...para, ...cc, ...bcc].filter((c) => !esCorreoValido(c))
  const faltantes: string[] = []
  if (!archivos.length) faltantes.push('sube el archivo del informe')
  if (!soldTo) faltantes.push('elige el Sold To')
  else if (!shipTo) faltantes.push('elige el Ship To')
  else if (!para.length) faltantes.push('escribe al menos un correo en Para')
  if (correosMalos.length) faltantes.push(`corrige: ${correosMalos.join(', ')}`)
  const puedeEnviar = faltantes.length === 0 && !enviando && !!estado

  const listaEditada =
    !!plan &&
    (JSON.stringify(para) !== JSON.stringify(plan.to) ||
      JSON.stringify(cc) !== JSON.stringify(plan.cc) ||
      JSON.stringify(bcc) !== JSON.stringify(plan.bcc))

  function limpiarEnvio() {
    setArchivos([])
    setSoldTo('')
    setShipTo('')
    setEspecie('')
    vaciarDestinatarios()
    setAsuntoManual(null)
    setCuerpoManual(null)
  }

  async function enviar() {
    setConfirmando(false)
    setEnviando(true)
    setError(null)
    setExito(null)
    try {
      const r = await enviarInforme(datos, archivos)
      setExito(r.ok)
      limpiarEnvio()
      recargarHistorial()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo enviar el informe. Intenta de nuevo.'))
      recargarHistorial()
    } finally {
      setEnviando(false)
    }
  }

  const enProduccion = estado?.modo === 'produccion'
  const hayEspecies = !!plan && plan.especies.length > 0

  return (
    <div className={styles.vista}>
      <Header
        title="Envío de informes"
        description="Sube el informe del laboratorio, elige la planta y envíalo a su lista de distribución."
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
          <Paso numero={1} titulo="Informe" ayuda="El archivo que entregó el laboratorio. Puedes subir varios en un mismo correo.">
            <ZonaArchivos archivos={archivos} onChange={setArchivos} deshabilitado={enviando} />
          </Paso>

          <Paso numero={2} titulo="Cliente y planta" ayuda="Con el Sold To y el Ship To se busca la lista de distribución.">
            <div className={styles.rejilla}>
              <label className={styles.campoSelect}>
                <span>Laboratorio</span>
                <select value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)}>
                  {(estado?.laboratorios ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <BuscableSelect
                etiqueta="Sold To"
                opciones={clientes}
                valor={soldTo}
                onChange={elegirSoldTo}
                placeholderTodos="— elegir cliente —"
              />
              <BuscableSelect
                etiqueta="Ship To"
                opciones={plantasDelCliente}
                valor={shipTo}
                onChange={elegirShipTo}
                placeholderTodos={soldTo ? '— elegir planta —' : '— elige primero Sold To —'}
                disabled={!soldTo}
              />
              {hayEspecies && (
                <label className={styles.campoSelect}>
                  <span>Especie de la lista</span>
                  <select value={especie} onChange={(e) => setEspecie(e.target.value)}>
                    <option value="">Lista general</option>
                    {plan!.especies.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}
            </div>
            {hayEspecies && !especie && plan!.sin_lista && (
              <p className={styles.aviso}>
                Esta planta tiene listas por especie y ninguna general. Elige la especie del informe.
              </p>
            )}
          </Paso>

          <Paso
            numero={3}
            titulo="Destinatarios"
            ayuda="Lo que propone el sistema. Puedes quitar, agregar o pegar correos; el cambio vale solo para este envío."
          >
            {soldTo && shipTo && plan?.sin_lista && !cargandoPlan && para.length === 0 && (
              <p className={styles.aviso}>
                Esta planta no tiene lista de distribución de resultados. Escribe los correos en Para o elige otra
                planta{hayEspecies ? ' o especie' : ''}.
              </p>
            )}
            <ListaCorreos
              etiqueta="Para"
              valor={para}
              onChange={setPara}
              alerta={!!soldTo && !!shipTo && para.length === 0}
              ayuda={soldTo && shipTo ? 'Lista de distribución de la planta.' : 'Elige el Sold To y el Ship To para cargar la lista.'}
            />
            <ListaCorreos etiqueta="Copia (CC)" valor={cc} onChange={setCc} />
            <ListaCorreos etiqueta="Copia oculta (CCO)" valor={bcc} onChange={setBcc} />
            {listaEditada && plan && (
              <button
                type="button"
                className={styles.enlace}
                onClick={() => { setPara(plan.to); setCc(plan.cc); setBcc(plan.bcc) }}
              >
                Volver a la lista del sistema
              </button>
            )}
          </Paso>

          <Paso numero={4} titulo="Mensaje" ayuda="Parte con la plantilla del laboratorio. Edítalo aquí solo para este envío.">
            <label className={styles.campoTexto}>
              <span>Asunto</span>
              <input
                value={asuntoManual ?? vista?.asunto_base ?? ''}
                disabled={!vista}
                placeholder="Elige Sold To y Ship To"
                onChange={(e) => setAsuntoManual(e.target.value)}
              />
            </label>
            <label className={styles.campoTexto}>
              <span>Texto del correo</span>
              <textarea
                rows={9}
                value={cuerpoManual ?? vista?.texto_base ?? ''}
                disabled={!vista}
                onChange={(e) => setCuerpoManual(e.target.value)}
              />
            </label>
            {(asuntoManual !== null || cuerpoManual !== null) && (
              <button
                type="button"
                className={styles.enlace}
                onClick={() => { setAsuntoManual(null); setCuerpoManual(null) }}
              >
                Volver a la plantilla
              </button>
            )}
          </Paso>
        </div>

        <aside className={styles.columnaDer} aria-label="Vista previa del correo">
          <div className={styles.vistaPrevia}>
            <header className={styles.vistaCabecera}>
              <h2>Vista previa</h2>
              <span className={`${styles.etiquetaModo} ${enProduccion ? styles.etiquetaProduccion : styles.etiquetaPrueba}`}>
                {enProduccion ? 'Producción' : 'Prueba'}
              </span>
            </header>
            {vista ? (
              <>
                <dl className={styles.cabecerasCorreo}>
                  <dt>Para</dt><dd>{vista.efectivos.to.join(', ') || '—'}</dd>
                  {vista.efectivos.cc.length > 0 && (<><dt>CC</dt><dd>{vista.efectivos.cc.join(', ')}</dd></>)}
                  {vista.efectivos.bcc.length > 0 && (<><dt>CCO</dt><dd>{vista.efectivos.bcc.join(', ')}</dd></>)}
                  <dt>Asunto</dt><dd className={styles.asuntoVista}>{vista.asunto}</dd>
                  <dt>Adjuntos</dt><dd>{nombresArchivos.length ? nombresArchivos.join(', ') : 'Aún no hay archivos'}</dd>
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
                {errorVista ?? 'Elige el Sold To y el Ship To para ver cómo saldrá el correo.'}
              </p>
            )}
          </div>

          <div className={styles.barraEnvio}>
            <div className={styles.resumenEnvio}>
              {puedeEnviar ? (
                <p>
                  {enProduccion ? 'Saldrá a ' : 'Se probará con '}
                  <strong>{(vista?.efectivos.to.length ?? para.length)} {(vista?.efectivos.to.length ?? para.length) === 1 ? 'destinatario' : 'destinatarios'}</strong>
                  {' · '}
                  <strong>{archivos.length} {archivos.length === 1 ? 'archivo' : 'archivos'}</strong>
                </p>
              ) : (
                <p className={styles.faltan}>Para enviar: {faltantes.join('; ')}.</p>
              )}
            </div>
            <Button
              onClick={() => (enProduccion ? setConfirmando(true) : void enviar())}
              disabled={!puedeEnviar}
              className={styles.botonEnviar}
            >
              {enviando ? 'Enviando…' : enProduccion ? 'Enviar a clientes' : 'Enviar prueba'}
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
            onLaboratorio={setLaboratorio}
            onEstado={setEstado}
          />
        </details>
      )}

      <section className={styles.historial}>
        <h2>Últimos envíos</h2>
        <HistorialEnvios historial={historial} />
      </section>

      {confirmando && (
        <Modal
          titulo="Enviar a clientes"
          subtitulo="El sistema está en producción: este correo llegará a las personas de abajo."
          onCerrar={() => setConfirmando(false)}
          pie={
            <>
              <Button variant="secondary" onClick={() => setConfirmando(false)}>Cancelar</Button>
              <Button onClick={() => void enviar()}>Enviar a clientes</Button>
            </>
          }
        >
          <dl className={styles.confirmacion}>
            <dt>Planta</dt><dd>{soldTo} · {shipTo}{especie ? ` · ${especie}` : ''}</dd>
            <dt>Para</dt><dd>{para.join(', ')}</dd>
            {cc.length > 0 && (<><dt>CC</dt><dd>{cc.join(', ')}</dd></>)}
            {bcc.length > 0 && (<><dt>CCO</dt><dd>{bcc.join(', ')}</dd></>)}
            <dt>Asunto</dt><dd>{vista?.asunto}</dd>
            <dt>Archivos</dt><dd>{nombresArchivos.join(', ')}</dd>
          </dl>
        </Modal>
      )}
    </div>
  )
}
