import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { useAuth } from '@/features/auth'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Planta } from '@/features/catalogo'
import { crearSolicitud, LABORATORIOS } from '@/features/tomaMuestras'
import type { Laboratorio } from '@/features/tomaMuestras'
import { ROUTES } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './NuevaSolicitudView.module.css'

interface FormGeneral {
  solicitante: string
  especie: string
  variedad: string
  lineaProceso: string
  csg: string
  lote: string
  posicionMuestreo: string
  numeroCamara: string
  numeroOrden: string
  kilosProcesados: string
  productoUtilizado: string
  tipoMuestra: string
  fechaMuestreo: string
  horaMuestreo: string
  nombreMuestreador: string
  emailSolicitante: string
  emailLaboratorio: string
  observacion: string
}

const GENERAL_INICIAL: FormGeneral = {
  solicitante: '',
  especie: '',
  variedad: '',
  lineaProceso: '',
  csg: '',
  lote: '',
  posicionMuestreo: '',
  numeroCamara: '',
  numeroOrden: '',
  kilosProcesados: '',
  productoUtilizado: '',
  tipoMuestra: '',
  fechaMuestreo: '',
  horaMuestreo: '',
  nombreMuestreador: '',
  emailSolicitante: '',
  emailLaboratorio: '',
  observacion: '',
}

const CAMPOS_TEXTO: { clave: keyof FormGeneral; etiqueta: string }[] = [
  { clave: 'solicitante', etiqueta: 'Solicitante' },
  { clave: 'especie', etiqueta: 'Especie' },
  { clave: 'variedad', etiqueta: 'Variedad' },
  { clave: 'lineaProceso', etiqueta: 'Línea Proceso' },
  { clave: 'csg', etiqueta: 'CSG' },
  { clave: 'lote', etiqueta: 'Lote' },
  { clave: 'posicionMuestreo', etiqueta: 'Posición Muestreo' },
  { clave: 'numeroCamara', etiqueta: 'N° Cámara' },
  { clave: 'numeroOrden', etiqueta: 'N° Orden' },
  { clave: 'productoUtilizado', etiqueta: 'Producto Utilizado' },
  { clave: 'tipoMuestra', etiqueta: 'Tipo Muestra' },
  { clave: 'nombreMuestreador', etiqueta: 'Nombre Muestreador' },
]

interface CampoLaboratorio {
  etiqueta: string
  tipo: 'text' | 'number'
}

const ANALITOS_CROMATOGRAFIA = ['FDL', 'IMZ', 'PYR', 'TEBU', 'AZOX', 'TBZ', 'DPA']

const CAMPOS_CROMATOGRAFIA: CampoLaboratorio[] = [
  { etiqueta: 'Dosis Aplicada', tipo: 'text' },
  { etiqueta: 'Tipo Aplicación', tipo: 'text' },
]

const CAMPOS_DIAGNOFRUIT: CampoLaboratorio[] = [
  { etiqueta: 'Levaduras UFC/mL', tipo: 'number' },
  { etiqueta: 'Botrytis conidia/mL', tipo: 'number' },
  { etiqueta: 'Alternaria conidia/mL', tipo: 'number' },
  { etiqueta: 'Geotrichum esporas/mL', tipo: 'number' },
  { etiqueta: 'Penicillium conidia/mL', tipo: 'number' },
]

const CAMPOS_ALS: CampoLaboratorio[] = [
  { etiqueta: 'E. Coli UFC/100mL', tipo: 'number' },
  { etiqueta: 'Coliformes Totales UFC/100mL', tipo: 'number' },
  { etiqueta: 'Plomo mg/kg', tipo: 'number' },
  { etiqueta: 'Mercurio mg/kg', tipo: 'number' },
  { etiqueta: 'Arsénico mg/kg', tipo: 'number' },
  { etiqueta: 'Cadmio mg/kg', tipo: 'number' },
  { etiqueta: 'Aluminio mg/kg', tipo: 'number' },
  { etiqueta: 'Hongos UFC/g', tipo: 'number' },
  { etiqueta: 'Levaduras UFC/g', tipo: 'number' },
  { etiqueta: 'Coliformes Totales UFC/g', tipo: 'number' },
  { etiqueta: 'Escherichia coli UFC/g', tipo: 'number' },
  { etiqueta: 'Recuento Enterobacterias UFC/g', tipo: 'number' },
  { etiqueta: 'Salmonella 25g (P/A)', tipo: 'text' },
  { etiqueta: 'Cenizas Insolubles en Ácido (%)', tipo: 'number' },
  { etiqueta: 'Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)', tipo: 'number' },
  { etiqueta: 'Analito Pesticida 1', tipo: 'text' },
  { etiqueta: 'Resultado Pesticida 1', tipo: 'text' },
  { etiqueta: 'Analito Pesticida 2', tipo: 'text' },
  { etiqueta: 'Resultado Pesticida 2', tipo: 'text' },
  { etiqueta: 'Analito Pesticida 3', tipo: 'text' },
  { etiqueta: 'Resultado Pesticida 3', tipo: 'text' },
]

/** Campos propios (fuera de los analitos) según el laboratorio elegido. */
function camposDe(laboratorio: Laboratorio | ''): CampoLaboratorio[] {
  if (laboratorio === 'QUITECA' || laboratorio === 'AGROFRESH') return CAMPOS_CROMATOGRAFIA
  if (laboratorio === 'DIAGNOFRUIT') return CAMPOS_DIAGNOFRUIT
  if (laboratorio === 'ALS') return CAMPOS_ALS
  return []
}

export function NuevaSolicitudView() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [laboratorio, setLaboratorio] = useState<Laboratorio | ''>('')
  const [general, setGeneral] = useState<FormGeneral>(GENERAL_INICIAL)
  const [analitosSeleccionados, setAnalitosSeleccionados] = useState<string[]>([])
  const [camposLaboratorio, setCamposLaboratorio] = useState<Record<string, string>>({})

  const [clientesDisponibles, setClientesDisponibles] = useState<string[]>([])
  const [plantasDisponibles, setPlantasDisponibles] = useState<Planta[]>([])
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarClientes()
      .then((clientes) => setClientesDisponibles(clientes.map((c) => c.nombre)))
      .catch(() => setClientesDisponibles([]))
    listarPlantas()
      .then(setPlantasDisponibles)
      .catch(() => setPlantasDisponibles([]))
  }, [])

  const plantasDelCliente = plantasDisponibles.filter((p) => p.cliente_nombre === soldTo)
  const camposLabActuales = useMemo(() => camposDe(laboratorio), [laboratorio])
  const esCromatografia = laboratorio === 'QUITECA' || laboratorio === 'AGROFRESH'

  function alElegirSoldTo(v: string) {
    setSoldTo(v)
    setShipTo('')
  }

  function alCambiarLaboratorio(v: string) {
    // Al cambiar de laboratorio se descartan los campos propios del
    // laboratorio anterior: no deben quedar valores de otro laboratorio
    // ni enviarse a la solicitud final.
    setLaboratorio(v as Laboratorio | '')
    setAnalitosSeleccionados([])
    setCamposLaboratorio({})
  }

  function actualizarGeneral(campo: keyof FormGeneral, valor: string) {
    setGeneral((g) => ({ ...g, [campo]: valor }))
  }

  function alternarAnalito(codigo: string) {
    setAnalitosSeleccionados((actual) =>
      actual.includes(codigo) ? actual.filter((a) => a !== codigo) : [...actual, codigo],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!laboratorio) {
      setError('Selecciona un laboratorio.')
      return
    }
    if (!general.solicitante.trim()) {
      setError('Ingresa el solicitante.')
      return
    }
    if (!soldTo.trim()) {
      setError('Selecciona el Sold To.')
      return
    }

    const camposFinal: Record<string, string> = {}
    for (const analito of analitosSeleccionados) camposFinal[analito] = 'Solicitado'
    for (const campo of camposLabActuales) {
      const valor = camposLaboratorio[campo.etiqueta]
      if (valor && valor.trim()) camposFinal[campo.etiqueta] = valor.trim()
    }

    setGuardando(true)
    try {
      await crearSolicitud({
        laboratorio,
        solicitante: general.solicitante.trim(),
        sold_to: soldTo.trim(),
        ship_to: shipTo.trim() || null,
        especie: general.especie.trim() || null,
        variedad: general.variedad.trim() || null,
        linea_proceso: general.lineaProceso.trim() || null,
        csg: general.csg.trim() || null,
        lote: general.lote.trim() || null,
        posicion_muestreo: general.posicionMuestreo.trim() || null,
        numero_camara: general.numeroCamara.trim() || null,
        numero_orden: general.numeroOrden.trim() || null,
        kilos_procesados: general.kilosProcesados.trim() ? Number(general.kilosProcesados) : null,
        producto_utilizado: general.productoUtilizado.trim() || null,
        tipo_muestra: general.tipoMuestra.trim() || null,
        fecha_muestreo: general.fechaMuestreo || null,
        hora_muestreo: general.horaMuestreo || null,
        nombre_muestreador: general.nombreMuestreador.trim() || null,
        generado_por: user?.nombre ?? '',
        email_solicitante: general.emailSolicitante.trim() || null,
        email_laboratorio: general.emailLaboratorio.trim() || null,
        observacion: general.observacion.trim() || null,
        campos_laboratorio: camposFinal,
      })
      navigate(ROUTES.tomaMuestras)
    } catch {
      setError('No se pudo crear la solicitud. Revisa que el backend esté corriendo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <Header title="Nueva solicitud" description="Registra una nueva solicitud de muestreo." />

      <Card>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>N° Solicitud</span>
              <input value="Se asigna automáticamente al guardar" disabled />
            </label>
            <label className={styles.campo}>
              <span>Fecha de solicitud</span>
              <input value={formatDateCL(new Date())} disabled />
            </label>
          </div>

          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>Laboratorio</span>
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
              <input value={user?.nombre ?? ''} disabled required />
            </label>
          </div>

          <div className={styles.campo}>
            <BuscableSelect
              etiqueta="Sold To"
              opciones={clientesDisponibles}
              valor={soldTo}
              onChange={alElegirSoldTo}
              placeholderTodos="— elegir cliente —"
            />
          </div>

          {soldTo && (
            <div className={styles.campo}>
              <BuscableSelect
                etiqueta="Ship To"
                opciones={plantasDelCliente.map((p) => p.nombre)}
                valor={shipTo}
                onChange={setShipTo}
                placeholderTodos="— sin sucursal específica —"
              />
            </div>
          )}

          <div className={styles.fila}>
            {CAMPOS_TEXTO.map(({ clave, etiqueta }) => (
              <label className={styles.campo} key={clave}>
                <span>{etiqueta}</span>
                <input value={general[clave]} onChange={(e) => actualizarGeneral(clave, e.target.value)} />
              </label>
            ))}

            <label className={styles.campo}>
              <span>Kilos Procesados (KG)</span>
              <input
                type="number"
                value={general.kilosProcesados}
                onChange={(e) => actualizarGeneral('kilosProcesados', e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              <span>Fecha Muestreo</span>
              <input
                type="date"
                value={general.fechaMuestreo}
                onChange={(e) => actualizarGeneral('fechaMuestreo', e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              <span>Hora Muestreo</span>
              <input
                type="time"
                value={general.horaMuestreo}
                onChange={(e) => actualizarGeneral('horaMuestreo', e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              <span>Email Solicitante</span>
              <input
                type="email"
                value={general.emailSolicitante}
                onChange={(e) => actualizarGeneral('emailSolicitante', e.target.value)}
              />
            </label>
            <label className={styles.campo}>
              <span>Email Laboratorio</span>
              <input
                type="email"
                value={general.emailLaboratorio}
                onChange={(e) => actualizarGeneral('emailLaboratorio', e.target.value)}
              />
            </label>
          </div>

          <label className={styles.campo}>
            <span>Observación</span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={general.observacion}
              onChange={(e) => actualizarGeneral('observacion', e.target.value)}
            />
          </label>

          {laboratorio && (
            <fieldset className={styles.seccionLaboratorio}>
              <legend>Campos de {laboratorio}</legend>

              {esCromatografia && (
                <div className={styles.analitos}>
                  <span className={styles.analitosEtiqueta}>Analitos solicitados</span>
                  <div className={styles.analitosGrid}>
                    {ANALITOS_CROMATOGRAFIA.map((codigo) => (
                      <label key={codigo} className={styles.analitoCheckbox}>
                        <input
                          type="checkbox"
                          checked={analitosSeleccionados.includes(codigo)}
                          onChange={() => alternarAnalito(codigo)}
                        />
                        {codigo}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.fila}>
                {camposLabActuales.map((campo) => (
                  <label className={styles.campo} key={campo.etiqueta}>
                    <span>{campo.etiqueta}</span>
                    <input
                      type={campo.tipo}
                      value={camposLaboratorio[campo.etiqueta] ?? ''}
                      onChange={(e) =>
                        setCamposLaboratorio((c) => ({ ...c, [campo.etiqueta]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.acciones}>
            <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
