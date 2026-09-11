import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import {
  actualizarColumnaConfig,
  actualizarParametro,
  explicarErrorDeConfig,
  gasesApi,
  micropipetasApi,
  metodosApi,
  obtenerConfig,
  pesasApi,
  puntosTemperaturaApi,
} from '@/features/verificaciones'
import type { ColumnaConfig, ConfigVerificaciones, Metodo, Parametro } from '@/features/verificaciones'
import { HttpError } from '@/services/http/client'
import { CampoNumero } from './componentes'
import styles from './Verificaciones.module.css'

/**
 * Los criterios de aceptación, editables.
 *
 * En el Excel esto era la hoja «Parámetros»: cambiar una tolerancia era abrir
 * el archivo, buscar la celda y confiar en que nadie la hubiera movido. Acá
 * cada equipo lleva su criterio y se edita en su fila.
 *
 * Los valores que trae el sistema salen del Excel que el laboratorio usa hoy;
 * ninguno está inventado. Si alguno no corresponde, se corrige acá —y el
 * histórico se recalcula solo, porque los veredictos se computan al leer.
 */

/** `unidad` va aparte porque las etiquetas se muestran en mayúsculas y «µL»
 * en mayúscula es «ΜL», que se lee «ML». Ver `.unidad` en la hoja de estilos. */
type Campo = {
  clave: string
  etiqueta: string
  unidad?: string
  tipo: 'texto' | 'numero'
  ancho?: number
  editable?: boolean
}

type RangoTolerancia = {
  nominal: string
  tolerancia: string
  unidad: string
}

function Etiqueta({ campo }: { campo: Campo }) {
  return (
    <>
      {campo.etiqueta}
      {campo.unidad && <span className={styles.unidad}> ({campo.unidad})</span>}
    </>
  )
}

/** Aplica las personalizaciones guardadas por el usuario sobre los campos base. */
function aplicarConfigColumnas(campos: Campo[], configs: ColumnaConfig[] | undefined): Campo[] {
  if (!configs?.length) return campos
  const porClave = Object.fromEntries(configs.map((c) => [c.clave, c]))
  return campos
    .filter((c) => porClave[c.clave]?.visible !== false)
    .map((c) => {
      const cc = porClave[c.clave]
      if (!cc) return c
      return {
        ...c,
        etiqueta: cc.etiqueta ?? c.etiqueta,
        // null = usar defecto; string vacío = quitar unidad; string con valor = nuevo texto
        unidad: cc.unidad !== null ? cc.unidad || undefined : c.unidad,
      }
    })
}

// ---------------------------------------------------------------------------
// Editor de columnas
// ---------------------------------------------------------------------------

type BorradorColumna = {
  clave: string
  etiquetaDefault: string
  unidadDefault: string | undefined
  etiqueta: string
  unidad: string
  visible: boolean
}

function EditorColumnas({
  camposBase,
  configs,
  seccion,
  onGuardar,
  onError,
}: {
  camposBase: Campo[]
  configs: ColumnaConfig[] | undefined
  seccion: string
  onGuardar: () => void
  onError: (msg: string | null) => void
}) {
  const porClave = Object.fromEntries((configs ?? []).map((c) => [c.clave, c]))

  function borradorInicial(): BorradorColumna[] {
    return camposBase.map((c) => {
      const cc = porClave[c.clave]
      return {
        clave: c.clave,
        etiquetaDefault: c.etiqueta,
        unidadDefault: c.unidad,
        etiqueta: cc?.etiqueta ?? c.etiqueta,
        unidad: cc?.unidad ?? c.unidad ?? '',
        visible: cc?.visible ?? true,
      }
    })
  }

  const [filas, setFilas] = useState<BorradorColumna[]>(borradorInicial)
  const [guardando, setGuardando] = useState(false)

  function cambiar(clave: string, cambios: Partial<BorradorColumna>) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))
  }

  async function guardar() {
    setGuardando(true)
    onError(null)
    try {
      await Promise.all(
        filas.map((f) =>
          actualizarColumnaConfig(seccion, f.clave, {
            etiqueta: f.etiqueta !== f.etiquetaDefault ? f.etiqueta : null,
            unidad: f.unidad !== (f.unidadDefault ?? '') ? f.unidad || null : null,
            visible: f.visible,
          }),
        ),
      )
      onGuardar()
    } catch (e) {
      onError(e instanceof HttpError ? e.message : 'No se pudo guardar la configuración.')
    } finally {
      setGuardando(false)
    }
  }

  const tieneUnidades = camposBase.some((c) => c.unidad)

  return (
    <div className={styles.formulario} style={{ flexDirection: 'column', gap: 0 }}>
      <div className={styles.tablaWrap} style={{ marginBottom: 12 }}>
        <table className={styles.tabla} style={{ minWidth: 420 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>Vis.</th>
              <th>Columna original</th>
              <th>Nombre a mostrar</th>
              {tieneUnidades && <th>Unidad</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={f.visible}
                    onChange={(e) => cambiar(f.clave, { visible: e.target.checked })}
                    title={f.visible ? 'Ocultar columna' : 'Mostrar columna'}
                  />
                </td>
                <td className={styles.celdaEquipo} style={{ opacity: f.visible ? 1 : 0.4 }}>
                  {f.etiquetaDefault}
                  {f.unidadDefault && (
                    <span className={styles.unidad}> ({f.unidadDefault})</span>
                  )}
                </td>
                <td>
                  <input
                    className={styles.input}
                    style={{ width: 160 }}
                    value={f.etiqueta}
                    placeholder={f.etiquetaDefault}
                    disabled={!f.visible}
                    onChange={(e) => cambiar(f.clave, { etiqueta: e.target.value })}
                  />
                </td>
                {tieneUnidades && (
                  <td>
                    {f.unidadDefault !== undefined ? (
                      <input
                        className={styles.input}
                        style={{ width: 80 }}
                        value={f.unidad}
                        placeholder={f.unidadDefault ?? ''}
                        disabled={!f.visible}
                        onChange={(e) => cambiar(f.clave, { unidad: e.target.value })}
                      />
                    ) : (
                      <span style={{ color: 'var(--color-text-muted, #999)' }}>—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar columnas'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TablaCatalogo
// ---------------------------------------------------------------------------

interface TablaProps<T extends { id: number }> {
  titulo: string
  nota: string
  filas: T[]
  campos: Campo[]
  camposBase: Campo[]
  seccionColumnas?: string
  columnasConfig?: ColumnaConfig[]
  onActualizarColumna?: () => void
  vacio: Record<string, unknown>
  api: {
    crear: (datos: never) => Promise<T>
    actualizar: (id: number, datos: never) => Promise<T>
    eliminar: (id: number) => Promise<{ estado: string }>
  }
  onCambio: () => void
  onError: (mensaje: string | null) => void
  rango?: RangoTolerancia
}

/**
 * Un catálogo, editable en su propia tabla.
 *
 * Los cuatro catálogos son la misma pantalla con distintas columnas; por eso
 * las columnas son datos (`campos`) y no cuatro componentes casi iguales.
 */
function TablaCatalogo<T extends { id: number; activo: boolean; orden: number }>({
  titulo,
  nota,
  filas,
  campos,
  camposBase,
  seccionColumnas,
  columnasConfig,
  onActualizarColumna,
  vacio,
  api,
  onCambio,
  onError,
  rango,
}: TablaProps<T>) {
  const [borrador, setBorrador] = useState<Record<string, unknown> | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [configurandoColumnas, setConfigurandoColumnas] = useState(false)

  function abrirNuevo() {
    setEditando(null)
    setBorrador({ ...vacio, activo: true, orden: filas.length + 1, rango_minimo: null, rango_maximo: null })
    setConfigurandoColumnas(false)
    onError(null)
  }

  function abrirEdicion(fila: T) {
    setEditando(fila.id)
    const datos = { ...(fila as unknown as Record<string, unknown>) }
    if (rango) {
      const nominal = Number(datos[rango.nominal])
      const tolerancia = Number(datos[rango.tolerancia])
      datos.rango_minimo = nominal - tolerancia
      datos.rango_maximo = nominal + tolerancia
    }
    setBorrador(datos)
    setConfigurandoColumnas(false)
    onError(null)
  }

  function cerrar() {
    setEditando(null)
    setBorrador(null)
  }

  async function guardar() {
    if (!borrador) return
    const nombre = String(borrador.nombre ?? '').trim()
    if (!nombre) {
      onError('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    onError(null)
    try {
      const { id: _id, rango_minimo, rango_maximo, ...datos } = borrador as { id?: number; rango_minimo?: number | null; rango_maximo?: number | null } & Record<string, unknown>
      if (rango) {
        if (rango_minimo === null || rango_minimo === undefined || rango_maximo === null || rango_maximo === undefined) {
          onError('Indica el mínimo y máximo del rango de tolerancia.')
          return
        }
        if (rango_minimo >= rango_maximo) {
          onError('El mínimo del rango debe ser menor que el máximo.')
          return
        }
        datos[rango.nominal] = (rango_minimo + rango_maximo) / 2
        datos[rango.tolerancia] = (rango_maximo - rango_minimo) / 2
      }
      if (editando === null) await api.crear({ ...datos, nombre } as never)
      else await api.actualizar(editando, { ...datos, nombre } as never)
      cerrar()
      onCambio()
    } catch (e) {
      onError(e instanceof HttpError ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(fila: T) {
    onError(null)
    try {
      const { id, ...datos } = fila as unknown as { id: number } & Record<string, unknown>
      await api.actualizar(id, { ...datos, activo: !fila.activo } as never)
      onCambio()
    } catch (e) {
      onError(e instanceof HttpError ? e.message : 'No se pudo cambiar el estado.')
    }
  }

  async function borrar(fila: T) {
    const nombre = String((fila as unknown as Record<string, unknown>).nombre ?? '')
    if (!window.confirm(`¿Eliminar "${nombre}" del catálogo?`)) return
    onError(null)
    try {
      await api.eliminar(fila.id)
      onCambio()
    } catch (e) {
      // 409 = ya tiene verificaciones registradas. El backend explica por qué
      // no se puede y qué hacer en su lugar; se muestra tal cual.
      onError(e instanceof HttpError ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <Card className={styles.seccion}>
      <div className={styles.seccionCabecera}>
        <h3 className={styles.seccionTitulo}>{titulo}</h3>
        <div className={styles.seccionDerecha}>
          {seccionColumnas && (
            <Button
              variant="secondary"
              onClick={() => {
                setConfigurandoColumnas((v) => !v)
                if (borrador) cerrar()
              }}
            >
              {configurandoColumnas ? 'Cerrar columnas' : 'Columnas'}
            </Button>
          )}
          <Button variant="secondary" onClick={abrirNuevo}>
            Agregar
          </Button>
        </div>
        <p className={styles.seccionNota}>{nota}</p>
      </div>
      <div className={styles.seccionCuerpo}>
        {configurandoColumnas && seccionColumnas && (
          <EditorColumnas
            camposBase={camposBase}
            configs={columnasConfig}
            seccion={seccionColumnas}
            onGuardar={() => {
              setConfigurandoColumnas(false)
              onActualizarColumna?.()
            }}
            onError={onError}
          />
        )}

        {borrador && (
          <div className={styles.formulario}>
            {campos.filter((campo) => campo.editable !== false).map((campo) => (
              <label key={campo.clave} className={styles.campo}>
                <span className={styles.etiqueta}>
                  <Etiqueta campo={campo} />
                </span>
                {campo.tipo === 'numero' ? (
                  <CampoNumero
                    valor={(borrador[campo.clave] as number | null) ?? null}
                    ancho={campo.ancho ?? 110}
                    onCambio={(v) => setBorrador({ ...borrador, [campo.clave]: v })}
                  />
                ) : (
                  <input
                    className={styles.input}
                    style={{ width: campo.ancho ?? 180 }}
                    value={String(borrador[campo.clave] ?? '')}
                    onChange={(e) => setBorrador({ ...borrador, [campo.clave]: e.target.value })}
                  />
                )}
              </label>
            ))}
            {rango && (
              <>
                <label className={styles.campo}>
                  <span className={styles.etiqueta}>Rango mínimo <span className={styles.unidad}>({rango.unidad})</span></span>
                  <CampoNumero valor={(borrador.rango_minimo as number | null) ?? null} ancho={110} onCambio={(v) => setBorrador({ ...borrador, rango_minimo: v })} />
                </label>
                <label className={styles.campo}>
                  <span className={styles.etiqueta}>Rango máximo <span className={styles.unidad}>({rango.unidad})</span></span>
                  <CampoNumero valor={(borrador.rango_maximo as number | null) ?? null} ancho={110} onCambio={(v) => setBorrador({ ...borrador, rango_maximo: v })} />
                </label>
              </>
            )}
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : editando === null ? 'Agregar' : 'Guardar'}
            </Button>
            <Button variant="secondary" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        )}

        <div className={styles.tablaWrap}>
          <table className={styles.tabla} style={{ minWidth: 520 }}>
            <thead>
              <tr>
                {campos.map((c) => (
                  <th key={c.clave}>
                    <Etiqueta campo={c} />
                  </th>
                ))}
                {rango && <th>Rango de tolerancia</th>}
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const valores = fila as unknown as Record<string, unknown>
                return (
                  <tr key={fila.id} className={cn(!fila.activo && styles.inactivo)}>
                    {campos.map((c, i) => (
                      <td key={c.clave} className={i === 0 ? styles.celdaEquipo : undefined}>
                        {String(valores[c.clave] ?? '') || '—'}
                      </td>
                    ))}
                    {rango && (
                      <td className={styles.criterio}>
                        {Number(valores[rango.nominal]) - Number(valores[rango.tolerancia])} a {Number(valores[rango.nominal]) + Number(valores[rango.tolerancia])} <span className={styles.unidad}>{rango.unidad}</span>
                      </td>
                    )}
                    <td className={styles.criterio}>{fila.activo ? 'En uso' : 'Desactivado'}</td>
                    <td>
                      <div className={styles.acciones}>
                        <button
                          type="button"
                          className={styles.iconoBoton}
                          title={fila.activo ? 'Desactivar' : 'Activar'}
                          onClick={() => void alternarActivo(fila)}
                        >
                          {fila.activo ? '◉' : '○'}
                        </button>
                        <button
                          type="button"
                          className={styles.iconoBoton}
                          title="Editar"
                          onClick={() => abrirEdicion(fila)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className={cn(styles.iconoBoton, styles.iconoBotonPeligro)}
                          title="Eliminar"
                          onClick={() => void borrar(fila)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

/** Un criterio común. Guarda al salir del campo y no en cada tecla: escribir
 * «120» dispararía tres guardados, y el intermedio («12») sería un criterio
 * real durante un instante. */
function FilaParametro({
  parametro,
  onGuardar,
}: {
  parametro: Parametro
  onGuardar: (valor: number) => void
}) {
  const [valor, setValor] = useState<number | null>(parametro.valor)

  function confirmar() {
    if (valor === null || valor === parametro.valor) return setValor(parametro.valor)
    onGuardar(valor)
  }

  return (
    <tr>
      <td className={styles.celdaEquipo}>
        {parametro.descripcion || parametro.clave}
        <span className={styles.celdaNota}>{parametro.clave}</span>
      </td>
      <td>
        <span onBlur={confirmar} onKeyDown={(e) => e.key === 'Enter' && confirmar()}>
          <CampoNumero valor={valor} ancho={110} onCambio={setValor} />
        </span>
      </td>
      <td className={styles.criterio}>{parametro.unidad || '—'}</td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Campos base por sección (etiquetas y unidades originales, sin personalizar)
// ---------------------------------------------------------------------------

const CAMPOS_MICROPIPETAS: Campo[] = [
  { clave: 'nombre', etiqueta: 'Equipo', tipo: 'texto' },
  { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
  { clave: 'volumen_nominal', etiqueta: 'Vol. nominal', unidad: 'µL', tipo: 'numero', editable: false },
  { clave: 'tolerancia', etiqueta: 'Tolerancia ±', unidad: 'µL', tipo: 'numero', editable: false },
]

const CAMPOS_PESAS: Campo[] = [
  { clave: 'nombre', etiqueta: 'Pesa', tipo: 'texto', ancho: 140 },
  { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
  { clave: 'valor_nominal', etiqueta: 'Valor nominal', unidad: 'mg', tipo: 'numero', editable: false },
  { clave: 'tolerancia', etiqueta: 'Tolerancia ±', unidad: 'mg', tipo: 'numero', editable: false },
]

const CAMPOS_TEMPERATURA: Campo[] = [
  { clave: 'nombre', etiqueta: 'Punto de control', tipo: 'texto', ancho: 220 },
  { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
  { clave: 'minimo', etiqueta: 'Mínimo', unidad: '°C', tipo: 'numero', ancho: 90 },
  { clave: 'maximo', etiqueta: 'Máximo', unidad: '°C', tipo: 'numero', ancho: 90 },
]

const CAMPOS_GASES: Campo[] = [
  { clave: 'nombre', etiqueta: 'Gas', tipo: 'texto', ancho: 220 },
  { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
]

// ---------------------------------------------------------------------------
// Vista principal
// ---------------------------------------------------------------------------

export function CriteriosView() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<ConfigVerificaciones | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(
    () =>
      obtenerConfig()
        .then(setConfig)
        .catch((e: unknown) => setError(explicarErrorDeConfig(e))),
    [],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cambiarParametro(clave: string, valor: number) {
    setError(null)
    try {
      await actualizarParametro(clave, valor)
      await cargar()
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudo guardar el parámetro.')
    }
  }

  return (
    <div className={styles.wrap}>
      <Header
        title="Criterios de verificación"
        description="Los equipos que se verifican y contra qué criterio. Reemplaza la hoja «Parámetros» del Excel."
        acciones={
          <Button variant="secondary" onClick={() => navigate(ROUTES.agrofreshLabVerificaciones)}>
            Volver al día
          </Button>
        }
      />

      {error && <p className={styles.error}>{error}</p>}

      {!config ? (
        <Card className={styles.vacio}>Cargando…</Card>
      ) : (
        <div className={styles.grupos}>
          <TablaCatalogo
            titulo="Micropipetas"
            nota="Una fila por equipo y volumen: la misma pipeta se verifica a 900 y a 500 µL, y cada volumen tiene su propia tolerancia de aceptación."
            filas={config.micropipetas}
            camposBase={CAMPOS_MICROPIPETAS}
            campos={aplicarConfigColumnas(CAMPOS_MICROPIPETAS, config.columnas_config?.micropipetas)}
            seccionColumnas="micropipetas"
            columnasConfig={config.columnas_config?.micropipetas}
            onActualizarColumna={() => void cargar()}
            vacio={{ nombre: '', codigo: '', volumen_nominal: null, tolerancia: null }}
            api={micropipetasApi}
            onCambio={() => void cargar()}
            onError={setError}
            rango={{ nominal: 'volumen_nominal', tolerancia: 'tolerancia', unidad: 'µL' }}
          />

          <TablaCatalogo
            titulo="Pesas patrón"
            nota="El valor nominal y la tolerancia van en miligramos. La tolerancia se aplica al resultado de la verificación."
            filas={config.pesas}
            camposBase={CAMPOS_PESAS}
            campos={aplicarConfigColumnas(CAMPOS_PESAS, config.columnas_config?.pesas)}
            seccionColumnas="pesas"
            columnasConfig={config.columnas_config?.pesas}
            onActualizarColumna={() => void cargar()}
            vacio={{ nombre: '', codigo: '', valor_nominal: null, tolerancia: null }}
            api={pesasApi}
            onCambio={() => void cargar()}
            onError={setError}
            rango={{ nominal: 'valor_nominal', tolerancia: 'tolerancia', unidad: 'mg' }}
          />

          <TablaCatalogo
            titulo="Puntos de temperatura"
            nota="Sala, refrigerador y congelador. Cada punto tiene su propio rango."
            filas={config.puntos_temperatura}
            camposBase={CAMPOS_TEMPERATURA}
            campos={aplicarConfigColumnas(CAMPOS_TEMPERATURA, config.columnas_config?.puntos_temperatura)}
            seccionColumnas="puntos_temperatura"
            columnasConfig={config.columnas_config?.puntos_temperatura}
            onActualizarColumna={() => void cargar()}
            vacio={{ nombre: '', codigo: '', minimo: null, maximo: null }}
            api={puntosTemperaturaApi}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <TablaCatalogo<Metodo>
            titulo="Métodos analíticos"
            nota="Nombres de método cargados en el cromatógrafo. Se seleccionan desde la verificación diaria en Inyector y Detector."
            filas={config.metodos}
            camposBase={[{ clave: 'nombre', etiqueta: 'Nombre del método', tipo: 'texto', ancho: 280 }]}
            campos={[{ clave: 'nombre', etiqueta: 'Nombre del método', tipo: 'texto', ancho: 280 }]}
            vacio={{ nombre: '', orden: 0, activo: true }}
            api={metodosApi as never}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <TablaCatalogo
            titulo="Gases"
            nota="Las líneas del cromatógrafo. Los criterios de presión son comunes a todas y se editan más abajo."
            filas={config.gases}
            camposBase={CAMPOS_GASES}
            campos={aplicarConfigColumnas(CAMPOS_GASES, config.columnas_config?.gases)}
            seccionColumnas="gases"
            columnasConfig={config.columnas_config?.gases}
            onActualizarColumna={() => void cargar()}
            vacio={{ nombre: '', codigo: '' }}
            api={gasesApi}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <Card className={styles.seccion}>
            <div className={styles.seccionCabecera}>
              <h3 className={styles.seccionTitulo}>Tabla Z del agua (µL/mg)</h3>
              <p className={styles.seccionNota}>
                Factor de corrección gravimétrico por temperatura. Se usa para convertir las pesadas
                de micropipeta (mg) a volumen (µL). Valor fijo de la ASTM E542.
              </p>
            </div>
            <div className={styles.seccionCuerpo}>
              <div className={styles.tablaWrap}>
                <table className={styles.tabla} style={{ minWidth: 280 }}>
                  <thead>
                    <tr>
                      <th>Temp. <span className={styles.unidad}>(°C)</span></th>
                      <th>Factor Z <span className={styles.unidad}>(µL/mg)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.tabla_z.map((fz) => (
                      <tr key={fz.temperatura}>
                        <td className={styles.celdaEquipo}>{fz.temperatura} °C</td>
                        <td className={styles.criterio}>{fz.factor.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card className={styles.seccion}>
            <div className={styles.seccionCabecera}>
              <h3 className={styles.seccionTitulo}>Criterios comunes</h3>
              <p className={styles.seccionNota}>
                Los que no son de un equipo sino del sistema entero. No se crean ni se borran: el
                cálculo los conoce por nombre, solo cambia su valor.
              </p>
            </div>
            <div className={styles.seccionCuerpo}>
              <div className={styles.tablaWrap}>
                <table className={styles.tabla} style={{ minWidth: 460 }}>
                  <thead>
                    <tr>
                      <th>Criterio</th>
                      <th>Valor</th>
                      <th>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.parametros.map((p) => (
                      <FilaParametro
                        key={p.clave}
                        parametro={p}
                        onGuardar={(valor) => void cambiarParametro(p.clave, valor)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
