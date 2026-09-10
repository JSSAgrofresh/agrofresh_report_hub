import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import {
  actualizarParametro,
  explicarErrorDeConfig,
  gasesApi,
  micropipetasApi,
  obtenerConfig,
  pesasApi,
  puntosTemperaturaApi,
} from '@/features/verificaciones'
import type { ConfigVerificaciones, Parametro } from '@/features/verificaciones'
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
}

function Etiqueta({ campo }: { campo: Campo }) {
  return (
    <>
      {campo.etiqueta}
      {campo.unidad && <span className={styles.unidad}> ({campo.unidad})</span>}
    </>
  )
}

interface TablaProps<T extends { id: number }> {
  titulo: string
  nota: string
  filas: T[]
  campos: Campo[]
  vacio: Record<string, unknown>
  api: {
    crear: (datos: never) => Promise<T>
    actualizar: (id: number, datos: never) => Promise<T>
    eliminar: (id: number) => Promise<{ estado: string }>
  }
  onCambio: () => void
  onError: (mensaje: string | null) => void
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
  vacio,
  api,
  onCambio,
  onError,
}: TablaProps<T>) {
  const [borrador, setBorrador] = useState<Record<string, unknown> | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  function abrirNuevo() {
    setEditando(null)
    setBorrador({ ...vacio, activo: true, orden: filas.length + 1 })
    onError(null)
  }

  function abrirEdicion(fila: T) {
    setEditando(fila.id)
    setBorrador({ ...(fila as unknown as Record<string, unknown>) })
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
      const { id: _id, ...datos } = borrador as { id?: number } & Record<string, unknown>
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
          <Button variant="secondary" onClick={abrirNuevo}>
            Agregar
          </Button>
        </div>
        <p className={styles.seccionNota}>{nota}</p>
      </div>
      <div className={styles.seccionCuerpo}>
        {borrador && (
          <div className={styles.formulario}>
            {campos.map((campo) => (
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
            nota="Una fila por equipo y volumen: la misma pipeta se verifica a 900 y a 500 µL, y cada volumen tiene su tolerancia (referencia, no afecta el cálculo)."
            filas={config.micropipetas}
            campos={[
              { clave: 'nombre', etiqueta: 'Equipo', tipo: 'texto' },
              { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
              { clave: 'volumen_nominal', etiqueta: 'Vol. nominal', unidad: 'µL', tipo: 'numero' },
              { clave: 'tolerancia', etiqueta: 'Tolerancia ± (ref.)', unidad: 'µL', tipo: 'numero' },
            ]}
            vacio={{ nombre: '', codigo: '', volumen_nominal: null, tolerancia: null }}
            api={micropipetasApi}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <TablaCatalogo
            titulo="Pesas patrón"
            nota="El valor nominal y la tolerancia van en miligramos. La tolerancia es referencia."
            filas={config.pesas}
            campos={[
              { clave: 'nombre', etiqueta: 'Pesa', tipo: 'texto', ancho: 140 },
              { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
              { clave: 'valor_nominal', etiqueta: 'Valor nominal', unidad: 'mg', tipo: 'numero' },
              { clave: 'tolerancia', etiqueta: 'Tolerancia ± (ref.)', unidad: 'mg', tipo: 'numero' },
            ]}
            vacio={{ nombre: '', codigo: '', valor_nominal: null, tolerancia: null }}
            api={pesasApi}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <TablaCatalogo
            titulo="Puntos de temperatura"
            nota="Sala, refrigerador y congelador. Cada punto tiene su propio rango."
            filas={config.puntos_temperatura}
            campos={[
              { clave: 'nombre', etiqueta: 'Punto de control', tipo: 'texto', ancho: 220 },
              { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
              { clave: 'minimo', etiqueta: 'Mínimo', unidad: '°C', tipo: 'numero', ancho: 90 },
              { clave: 'maximo', etiqueta: 'Máximo', unidad: '°C', tipo: 'numero', ancho: 90 },
            ]}
            vacio={{ nombre: '', codigo: '', minimo: null, maximo: null }}
            api={puntosTemperaturaApi}
            onCambio={() => void cargar()}
            onError={setError}
          />

          <TablaCatalogo
            titulo="Gases"
            nota="Las líneas del cromatógrafo. Los criterios de presión son comunes a todas y se editan más abajo."
            filas={config.gases}
            campos={[
              { clave: 'nombre', etiqueta: 'Gas', tipo: 'texto', ancho: 220 },
              { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 120 },
            ]}
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
