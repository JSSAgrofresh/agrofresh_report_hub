import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  listarAnalisis,
  listarContactos,
  listarUnidades,
  resumenLaboratorios,
} from '@/features/laboratorios'
import type { Analisis, Contacto, ResumenLaboratorio, Unidad } from '@/features/laboratorios'
import {
  actualizarLaboratorioConfig,
  crearLaboratorioConfig,
  listarAnalitosConfig,
  listarCategoriasAnaliticas,
  listarLaboratoriosConfig,
} from '@/features/tomaMuestras'
import type { AnalitoConfig, CategoriaAnaliticaConfig, LaboratorioConfig, LaboratorioInput } from '@/features/tomaMuestras'
import { verificarClave } from '@/features/auth/api/authApi'
import { acentoDeLaboratorio, inicialesDe } from './acento'
import { AnalisisPanel } from './AnalisisPanel'
import { AnalitosPanel } from './AnalitosPanel'
import { ContactosPanel } from './ContactosPanel'
import { ResultadosPanel } from './ResultadosPanel'
import { UnidadesPanel } from './UnidadesPanel'
import { TemplateMailPanel } from './TemplateMailPanel'
import styles from './LaboratoriosView.module.css'

type Pestana = 'contactos' | 'analisis' | 'analitos' | 'resultados' | 'template'

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'analisis', etiqueta: 'Análisis' },
  { valor: 'analitos', etiqueta: 'Analitos' },
  { valor: 'contactos', etiqueta: 'Contacto laboratorio' },
  { valor: 'resultados', etiqueta: 'Resultado a clientes' },
  { valor: 'template', etiqueta: 'Template mail' },
]

const LAB_VACIO = { codigo: '', nombre: '', descripcion: '', prefijo_solicitud: '' }

export function LaboratoriosView() {
  const [laboratorios, setLaboratorios] = useState<ResumenLaboratorio[] | null>(null)
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [analisis, setAnalisis] = useState<Analisis[]>([])
  const [analitos, setAnalitos] = useState<AnalitoConfig[]>([])
  const [categorias, setCategorias] = useState<CategoriaAnaliticaConfig[]>([])
  const [unidades, setUnidades] = useState<Unidad[]>([])

  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [pestana, setPestana] = useState<Pestana>('analisis')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarUnidades, setMostrarUnidades] = useState(false)
  const [formLab, setFormLab] = useState<{ modo: 'nuevo' | 'editar'; datos: typeof LAB_VACIO } | null>(null)
  const [guardandoLab, setGuardandoLab] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardandoAdjunto, setGuardandoAdjunto] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState<ResumenLaboratorio | null>(null)
  const [claveToggle, setClaveToggle] = useState('')
  const [toggleandoActivo, setToggleandoActivo] = useState(false)
  const [errorToggle, setErrorToggle] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      resumenLaboratorios(),
      listarContactos(),
      listarAnalisis(),
      listarAnalitosConfig(),
      listarCategoriasAnaliticas(),
      listarUnidades(),
    ])
      .then(([labs, cs, an, al, cat, un]) => {
        setLaboratorios(labs)
        setContactos(cs)
        setAnalisis(an)
        setAnalitos(al)
        setCategorias(cat)
        setUnidades(un)
      })
      .catch(() => setError('No se pudo cargar la configuración de laboratorios.'))
  }, [])

  const lab = useMemo(
    () => laboratorios?.find((l) => l.codigo === seleccionado) ?? null,
    [laboratorios, seleccionado],
  )

  const filtrados = useMemo(() => {
    if (!laboratorios) return []
    const q = busqueda.trim().toLowerCase()
    if (!q) return laboratorios
    return laboratorios.filter(
      (l) => l.nombre.toLowerCase().includes(q) || l.codigo.toLowerCase().includes(q),
    )
  }, [laboratorios, busqueda])

  // Los contadores de las tarjetas se calculan en el backend, pero después de
  // crear o borrar algo hay que reflejarlo sin recargar toda la vista.
  const contadores = useMemo(() => {
    if (!lab) return { analisis: 0, contactos: 0, resultados: 0, analitos: 0 }
    return {
      analisis: analisis.filter((a) => a.laboratorio === lab.codigo).length,
      contactos: contactos.filter((c) => c.laboratorio === lab.codigo && c.tipo === 'solicitud').length,
      // La config de resultados es compartida entre todos los labs.
      resultados: contactos.filter((c) => c.tipo !== 'solicitud').length,
      analitos: analitos.filter((a) => a.laboratorio === lab.codigo).length,
    }
  }, [lab, analisis, contactos, analitos])

  async function guardarLaboratorio() {
    if (!formLab) return
    const { codigo, nombre, descripcion, prefijo_solicitud } = formLab.datos
    if (!codigo.trim() || !nombre.trim()) {
      setError('El código y el nombre del laboratorio son obligatorios.')
      return
    }
    setGuardandoLab(true)
    setError(null)
    try {
      if (formLab.modo === 'editar') {
        const todos = await listarLaboratoriosConfig()
        const actual = todos.find((l) => l.codigo === seleccionado)
        if (!actual) throw new Error('no encontrado')
        const datos: LaboratorioInput = {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          prefijo_solicitud: prefijo_solicitud.trim().toUpperCase(),
          activo: actual.activo,
          orden: actual.orden,
          adjuntos_excel: actual.adjuntos_excel,
          adjuntos_json: actual.adjuntos_json,
        }
        await actualizarLaboratorioConfig(actual.id, datos)
      } else {
        const datos: LaboratorioInput = {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          prefijo_solicitud: prefijo_solicitud.trim().toUpperCase(),
          activo: true,
          orden: (laboratorios?.length ?? 0) + 1,
          adjuntos_excel: true,
          adjuntos_json: false,
        }
        await crearLaboratorioConfig(datos)
      }
      setLaboratorios(await resumenLaboratorios())
      if (formLab.modo === 'editar') setSeleccionado(codigo.trim().toUpperCase())
      setFormLab(null)
    } catch {
      setError(
        formLab.modo === 'editar'
          ? 'No se pudo guardar el laboratorio. Revisa que el código y el prefijo de solicitud no estén repetidos.'
          : 'No se pudo crear el laboratorio. Revisa que el código y el prefijo de solicitud no existan ya.',
      )
    } finally {
      setGuardandoLab(false)
    }
  }

  async function toggleAdjunto(campo: 'adjuntos_excel' | 'adjuntos_json', nuevoValor: boolean) {
    if (!seleccionado || guardandoAdjunto) return
    setGuardandoAdjunto(true)
    setError(null)
    try {
      const todos: LaboratorioConfig[] = await listarLaboratoriosConfig()
      const actual = todos.find((l) => l.codigo === seleccionado)
      if (!actual) throw new Error('no encontrado')
      await actualizarLaboratorioConfig(actual.id, {
        codigo: actual.codigo,
        nombre: actual.nombre,
        descripcion: actual.descripcion,
        prefijo_solicitud: actual.prefijo_solicitud,
        activo: actual.activo,
        orden: actual.orden,
        adjuntos_excel: campo === 'adjuntos_excel' ? nuevoValor : actual.adjuntos_excel,
        adjuntos_json: campo === 'adjuntos_json' ? nuevoValor : actual.adjuntos_json,
      })
      setLaboratorios(await resumenLaboratorios())
    } catch {
      setError('No se pudo guardar la configuración de adjuntos.')
    } finally {
      setGuardandoAdjunto(false)
    }
  }

  async function confirmarToggleActivo() {
    if (!confirmToggle || toggleandoActivo) return
    setToggleandoActivo(true)
    setErrorToggle(null)
    try {
      await verificarClave(claveToggle)
      const todos: LaboratorioConfig[] = await listarLaboratoriosConfig()
      const actual = todos.find((l) => l.codigo === confirmToggle.codigo)
      if (!actual) throw new Error('no encontrado')
      await actualizarLaboratorioConfig(actual.id, {
        codigo: actual.codigo,
        nombre: actual.nombre,
        descripcion: actual.descripcion,
        prefijo_solicitud: actual.prefijo_solicitud,
        activo: !actual.activo,
        orden: actual.orden,
        adjuntos_excel: actual.adjuntos_excel,
        adjuntos_json: actual.adjuntos_json,
      })
      setLaboratorios(await resumenLaboratorios())
      setConfirmToggle(null)
      setClaveToggle('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setErrorToggle(
        msg.toLowerCase().includes('contraseña') || msg.toLowerCase().includes('incorrect')
          ? 'Contraseña incorrecta.'
          : 'No se pudo actualizar el laboratorio.',
      )
    } finally {
      setToggleandoActivo(false)
    }
  }

  if (laboratorios === null) {
    return (
      <div className={styles.wrap}>
        <Header title="Laboratorios" description="Cargando configuración…" />
        <Card>
          <p className={styles.estado}>Cargando…</p>
        </Card>
      </div>
    )
  }

  // --- Detalle de un laboratorio -------------------------------------------

  if (lab) {
    const acento = acentoDeLaboratorio(lab.codigo)
    const contactosDelLab = contactos.filter((c) => c.laboratorio === lab.codigo)
    const conteoPestana: Record<Pestana, number> = {
      analisis: contadores.analisis,
      analitos: contadores.analitos,
      template: 0,
      contactos: contadores.contactos,
      resultados: contadores.resultados ?? 0,
    }

    return (
      <div className={styles.wrap}>
        <Header
          title="Laboratorios"
          description="Contactos, análisis y analitos de cada laboratorio."
          acciones={
            <Button variant="secondary" onClick={() => setSeleccionado(null)}>
              ← Todos los laboratorios
            </Button>
          }
        />

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.detalleCabecera} style={acento}>
          <span className={cn(styles.avatar, styles.avatarGrande)}>{inicialesDe(lab.nombre, lab.codigo)}</span>
          <div className={styles.detalleTitulos}>
            <h2 className={styles.detalleNombre}>
              {lab.nombre}
              <span className={styles.codigo}>{lab.codigo}</span>
              {!lab.activo && <span className={cn(styles.insignia, styles.insigniaInactivo)}>Inactivo</span>}
            </h2>
            <p className={styles.detalleDescripcion}>
              {lab.descripcion || 'Sin descripción.'}
            </p>
            <p className={styles.seccionNota}>
              Prefijo de solicitud:{' '}
              {lab.prefijo_solicitud ? (
                <span className={styles.codigo}>OT-{lab.prefijo_solicitud}0001</span>
              ) : (
                'sin configurar (folio OT-0001)'
              )}
            </p>
          </div>
          <div className={styles.detalleAcciones}>
            <Button
              variant="secondary"
              onClick={() =>
                setFormLab({
                  modo: 'editar',
                  datos: {
                    codigo: lab.codigo,
                    nombre: lab.nombre,
                    descripcion: lab.descripcion ?? '',
                    prefijo_solicitud: lab.prefijo_solicitud ?? '',
                  },
                })
              }
            >
              Editar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmToggle(lab)
                setClaveToggle('')
                setErrorToggle(null)
              }}
            >
              {lab.activo ? 'Inhabilitar' : 'Habilitar'}
            </Button>
          </div>
        </div>

        {formLab?.modo === 'editar' && (
          <div className={styles.formulario}>
            <div className={styles.formGrilla}>
              <div className={styles.campo}>
                <label className={styles.etiqueta}>Código</label>
                <input
                  className={cn(styles.input, styles.inputMono)}
                  value={formLab.datos.codigo}
                  onChange={(e) =>
                    setFormLab({ ...formLab, datos: { ...formLab.datos, codigo: e.target.value.toUpperCase() } })
                  }
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta}>Nombre</label>
                <input
                  className={styles.input}
                  value={formLab.datos.nombre}
                  onChange={(e) => setFormLab({ ...formLab, datos: { ...formLab.datos, nombre: e.target.value } })}
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.etiqueta}>Prefijo de solicitud</label>
                <input
                  className={cn(styles.input, styles.inputMono)}
                  value={formLab.datos.prefijo_solicitud}
                  placeholder="AGF"
                  maxLength={8}
                  onChange={(e) =>
                    setFormLab({
                      ...formLab,
                      datos: { ...formLab.datos, prefijo_solicitud: e.target.value.toUpperCase() },
                    })
                  }
                />
                <small className={styles.seccionNota}>
                  Va en cada folio: OT-{formLab.datos.prefijo_solicitud || '···'}0001
                </small>
              </div>
              <div className={cn(styles.campo, styles.campoAncho)}>
                <label className={styles.etiqueta}>Descripción</label>
                <input
                  className={styles.input}
                  value={formLab.datos.descripcion}
                  onChange={(e) =>
                    setFormLab({ ...formLab, datos: { ...formLab.datos, descripcion: e.target.value } })
                  }
                />
              </div>
            </div>
            <div className={styles.formAcciones}>
              <Button variant="secondary" onClick={() => setFormLab(null)} disabled={guardandoLab}>
                Cancelar
              </Button>
              <Button onClick={guardarLaboratorio} disabled={guardandoLab}>
                {guardandoLab ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        )}

        <div className={styles.adjuntosPanel}>
          <p className={styles.adjuntosTitulo}>Archivos adjuntos al enviar solicitudes</p>
          <div className={styles.adjuntosFilas}>
            {([
              { campo: 'adjuntos_excel' as const, etiqueta: 'Excel' },
              { campo: 'adjuntos_json' as const, etiqueta: 'JSON' },
            ]).map(({ campo, etiqueta }) => {
              const activo = lab[campo]
              return (
                <div key={campo} className={styles.adjuntosFila}>
                  <span className={styles.adjuntosNombre}>{etiqueta}</span>
                  <button
                    type="button"
                    disabled={guardandoAdjunto}
                    onClick={() => void toggleAdjunto(campo, !activo)}
                    className={`${styles.adjuntosToggle} ${activo ? styles.adjuntosToggleOn : styles.adjuntosToggleOff} ${guardandoAdjunto ? styles.adjuntosToggleFijo : ''}`}
                    title={activo ? `Desactivar ${etiqueta}` : `Activar ${etiqueta}`}
                  >
                    <span className={styles.adjuntosToggleCirculo} />
                  </button>
                  <span className={styles.adjuntosEstado}>{activo ? 'Se adjunta' : 'No se adjunta'}</span>
                </div>
              )
            })}
            <div className={styles.adjuntosFila}>
              <span className={styles.adjuntosNombre}>PDF</span>
              <button
                type="button"
                disabled
                className={`${styles.adjuntosToggle} ${styles.adjuntosToggleOn} ${styles.adjuntosToggleFijo}`}
              >
                <span className={styles.adjuntosToggleCirculo} />
              </button>
              <span className={styles.adjuntosEstado}>Siempre activo</span>
            </div>
          </div>
        </div>

        <div className={styles.tabs} style={acento}>
          {PESTANAS.map((p) => (
            <button
              key={p.valor}
              className={cn(styles.tab, pestana === p.valor && styles.tabActiva)}
              onClick={() => setPestana(p.valor)}
            >
              {p.etiqueta}
              {p.valor !== 'template' && <span className={styles.tabConteo}>{conteoPestana[p.valor]}</span>}
            </button>
          ))}
        </div>

        {confirmToggle && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCaja} role="dialog" aria-modal="true" aria-label="Confirmar cambio de estado">
              <h3 className={styles.modalTitulo}>
                {confirmToggle.activo ? 'Inhabilitar' : 'Habilitar'} {confirmToggle.nombre}
              </h3>
              <p className={styles.modalTexto}>
                {confirmToggle.activo
                  ? 'Al inhabilitar este laboratorio, nadie podrá crear ni enviar solicitudes a él hasta que lo vuelvas a habilitar.'
                  : 'Al habilitar este laboratorio, los usuarios podrán volver a crear y enviar solicitudes.'}
              </p>
              <p className={styles.modalTexto}>Ingresa tu contraseña para confirmar:</p>
              <input
                type="password"
                className={styles.input}
                value={claveToggle}
                onChange={(e) => { setClaveToggle(e.target.value); setErrorToggle(null) }}
                placeholder="Tu contraseña"
                autoFocus
                disabled={toggleandoActivo}
                onKeyDown={(e) => { if (e.key === 'Enter') void confirmarToggleActivo() }}
              />
              {errorToggle && <p className={styles.modalError}>{errorToggle}</p>}
              <div className={styles.modalAcciones}>
                <Button
                  variant="secondary"
                  onClick={() => { setConfirmToggle(null); setClaveToggle(''); setErrorToggle(null) }}
                  disabled={toggleandoActivo}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void confirmarToggleActivo()}
                  disabled={!claveToggle || toggleandoActivo}
                >
                  {toggleandoActivo ? 'Confirmando…' : (confirmToggle.activo ? 'Inhabilitar' : 'Habilitar')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card>
          {pestana === 'analisis' && (
            <AnalisisPanel
              laboratorio={lab.codigo}
              analisis={analisis.filter((a) => a.laboratorio === lab.codigo)}
              analitos={analitos.filter((a) => a.laboratorio === lab.codigo)}
              onCambio={(delLab) =>
                setAnalisis([...analisis.filter((a) => a.laboratorio !== lab.codigo), ...delLab])
              }
              onError={setError}
            />
          )}

          {pestana === 'analitos' && (
            <AnalitosPanel
              laboratorio={lab.codigo}
              analitos={analitos}
              categorias={categorias}
              onCambio={setAnalitos}
              onError={setError}
            />
          )}

          {pestana === 'contactos' && (
            <ContactosPanel
              laboratorio={lab.codigo}
              contactos={contactosDelLab}
              secciones={[
                {
                  tipo: 'solicitud',
                  titulo: 'Reciben las solicitudes',
                  nota: 'A estos correos les llega la solicitud de análisis cuando se emite. Cada uno puede ir en Para, Copia (CC) o Copia oculta (CCO): por ejemplo, alguien de AgroFresh que tiene que estar en todas las solicitudes de este laboratorio.',
                },
              ]}
              onCambio={(delLab) =>
                setContactos([...contactos.filter((c) => c.laboratorio !== lab.codigo), ...delLab])
              }
              onError={setError}
            />
          )}

          {pestana === 'resultados' && (
            <ResultadosPanel
              laboratorio={lab.codigo}
              contactos={contactos.filter((c) => c.tipo !== 'solicitud')}
              onCambio={(todos) =>
                setContactos([
                  ...contactos.filter((c) => c.tipo === 'solicitud'),
                  ...todos,
                ])
              }
              onError={setError}
            />
          )}

          {pestana === 'template' && (
            <TemplateMailPanel laboratorio={lab.codigo} onError={setError} />
          )}
        </Card>
      </div>
    )
  }

  // --- Grilla de laboratorios ----------------------------------------------

  return (
    <div className={styles.wrap}>
      <Header
        title="Laboratorios"
        description="Elige un laboratorio para configurar sus contactos, análisis y analitos."
        acciones={
          <Button variant="secondary" onClick={() => setMostrarUnidades((v) => !v)}>
            {mostrarUnidades ? 'Ocultar unidades' : 'Unidades de medida'}
          </Button>
        }
      />

      {error && <p className={styles.error}>{error}</p>}

      {mostrarUnidades && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <UnidadesPanel unidades={unidades} onCambio={setUnidades} onError={setError} />
        </Card>
      )}

      <div className={styles.barra}>
        <div className={styles.buscador}>
          <svg className={styles.buscadorIcono} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            className={styles.buscadorInput}
            placeholder="Buscar laboratorio…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {formLab?.modo === 'nuevo' && (
        <div className={styles.formulario}>
          <div className={styles.formGrilla}>
            <div className={styles.campo}>
              <label className={styles.etiqueta}>Código</label>
              <input
                className={cn(styles.input, styles.inputMono)}
                value={formLab.datos.codigo}
                autoFocus
                placeholder="SGS"
                onChange={(e) =>
                  setFormLab({ ...formLab, datos: { ...formLab.datos, codigo: e.target.value.toUpperCase() } })
                }
              />
            </div>
            <div className={styles.campo}>
              <label className={styles.etiqueta}>Nombre</label>
              <input
                className={styles.input}
                value={formLab.datos.nombre}
                placeholder="SGS Chile"
                onChange={(e) => setFormLab({ ...formLab, datos: { ...formLab.datos, nombre: e.target.value } })}
              />
            </div>
            <div className={styles.campo}>
              <label className={styles.etiqueta}>Prefijo de solicitud (opcional)</label>
              <input
                className={cn(styles.input, styles.inputMono)}
                value={formLab.datos.prefijo_solicitud}
                placeholder="SGS"
                maxLength={8}
                onChange={(e) =>
                  setFormLab({
                    ...formLab,
                    datos: { ...formLab.datos, prefijo_solicitud: e.target.value.toUpperCase() },
                  })
                }
              />
              <small className={styles.seccionNota}>
                Va en cada folio: OT-{formLab.datos.prefijo_solicitud || '···'}0001
              </small>
            </div>
            <div className={cn(styles.campo, styles.campoAncho)}>
              <label className={styles.etiqueta}>Descripción (opcional)</label>
              <input
                className={styles.input}
                value={formLab.datos.descripcion}
                placeholder="Laboratorio externo de residuos"
                onChange={(e) => setFormLab({ ...formLab, datos: { ...formLab.datos, descripcion: e.target.value } })}
              />
            </div>
          </div>
          <div className={styles.formAcciones}>
            <Button variant="secondary" onClick={() => setFormLab(null)} disabled={guardandoLab}>
              Cancelar
            </Button>
            <Button onClick={guardarLaboratorio} disabled={guardandoLab}>
              {guardandoLab ? 'Creando…' : 'Crear laboratorio'}
            </Button>
          </div>
        </div>
      )}

      <div className={styles.grilla}>
        {filtrados.map((l) => (
          <button
            key={l.codigo}
            className={cn(styles.tarjeta, !l.activo && styles.tarjetaInactiva)}
            style={acentoDeLaboratorio(l.codigo)}
            onClick={() => {
              setSeleccionado(l.codigo)
              setPestana('analisis')
              setError(null)
            }}
          >
            <div className={styles.tarjetaCabecera}>
              <span className={styles.avatar}>{inicialesDe(l.nombre, l.codigo)}</span>
              <div className={styles.tarjetaTitulos}>
                <p className={styles.tarjetaNombre}>{l.nombre}</p>
                <span className={styles.codigo}>{l.codigo}</span>
              </div>
            </div>

            <p className={styles.tarjetaDescripcion}>{l.descripcion || 'Sin descripción.'}</p>

            <div className={styles.metricas}>
              <div className={styles.metrica}>
                <span className={styles.metricaValor}>{l.n_analisis}</span>
                <span className={styles.metricaEtiqueta}>Análisis</span>
              </div>
              <div className={styles.metrica}>
                <span className={styles.metricaValor}>{l.n_analitos}</span>
                <span className={styles.metricaEtiqueta}>Analitos</span>
              </div>
              <div className={styles.metrica}>
                <span className={styles.metricaValor}>{l.n_contactos}</span>
                <span className={styles.metricaEtiqueta}>Contactos</span>
              </div>
            </div>
          </button>
        ))}

        {!formLab && (
          <button className={styles.tarjetaNueva} onClick={() => setFormLab({ modo: 'nuevo', datos: LAB_VACIO })}>
            <span className={styles.tarjetaNuevaMas}>+</span>
            Nuevo laboratorio
          </button>
        )}
      </div>
    </div>
  )
}
