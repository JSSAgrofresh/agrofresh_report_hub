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
import type { AnalitoConfig, CategoriaAnaliticaConfig, LaboratorioInput } from '@/features/tomaMuestras'
import { acentoDeLaboratorio, inicialesDe } from './acento'
import { AnalisisPanel } from './AnalisisPanel'
import { AnalitosPanel } from './AnalitosPanel'
import { ContactosPanel } from './ContactosPanel'
import { UnidadesPanel } from './UnidadesPanel'
import styles from './LaboratoriosView.module.css'

type Pestana = 'contactos' | 'analisis' | 'analitos' | 'resultados'

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'analisis', etiqueta: 'Análisis' },
  { valor: 'analitos', etiqueta: 'Analitos' },
  { valor: 'contactos', etiqueta: 'Contactos' },
  { valor: 'resultados', etiqueta: 'Resultados' },
]

const LAB_VACIO = { codigo: '', nombre: '', descripcion: '' }

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
      resultados: contactos.filter((c) => c.laboratorio === lab.codigo && c.tipo !== 'solicitud').length,
      analitos: analitos.filter((a) => a.laboratorio === lab.codigo).length,
    }
  }, [lab, analisis, contactos, analitos])

  async function guardarLaboratorio() {
    if (!formLab) return
    const { codigo, nombre, descripcion } = formLab.datos
    if (!codigo.trim() || !nombre.trim()) {
      setError('El código y el nombre del laboratorio son obligatorios.')
      return
    }
    setGuardandoLab(true)
    setError(null)
    try {
      const datos: LaboratorioInput = {
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        activo: true,
        orden: (laboratorios?.length ?? 0) + 1,
      }
      if (formLab.modo === 'editar') {
        // El resumen no trae el id del mantenedor, así que se resuelve por
        // código contra la lista completa antes de actualizar.
        const todos = await listarLaboratoriosConfig()
        const actual = todos.find((l) => l.codigo === seleccionado)
        if (!actual) throw new Error('no encontrado')
        await actualizarLaboratorioConfig(actual.id, { ...datos, activo: actual.activo, orden: actual.orden })
      } else {
        await crearLaboratorioConfig(datos)
      }
      setLaboratorios(await resumenLaboratorios())
      if (formLab.modo === 'editar') setSeleccionado(datos.codigo)
      setFormLab(null)
    } catch {
      setError(
        formLab.modo === 'editar'
          ? 'No se pudo guardar el laboratorio.'
          : 'No se pudo crear el laboratorio. Revisa que el código no exista y sea en mayúsculas.',
      )
    } finally {
      setGuardandoLab(false)
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
          </div>
          <div className={styles.detalleAcciones}>
            <Button
              variant="secondary"
              onClick={() =>
                setFormLab({
                  modo: 'editar',
                  datos: { codigo: lab.codigo, nombre: lab.nombre, descripcion: lab.descripcion ?? '' },
                })
              }
            >
              Editar
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

        <div className={styles.tabs} style={acento}>
          {PESTANAS.map((p) => (
            <button
              key={p.valor}
              className={cn(styles.tab, pestana === p.valor && styles.tabActiva)}
              onClick={() => setPestana(p.valor)}
            >
              {p.etiqueta}
              <span className={styles.tabConteo}>{conteoPestana[p.valor]}</span>
            </button>
          ))}
        </div>

        <Card>
          {pestana === 'analisis' && (
            <AnalisisPanel
              laboratorio={lab.codigo}
              analisis={analisis.filter((a) => a.laboratorio === lab.codigo)}
              analitos={analitos.filter((a) => a.laboratorio === lab.codigo)}
              unidades={unidades}
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
              unidades={unidades}
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
                  nota: 'A estos correos les llega la solicitud de muestreo cuando se emite.',
                },
              ]}
              onCambio={(delLab) =>
                setContactos([...contactos.filter((c) => c.laboratorio !== lab.codigo), ...delLab])
              }
              onError={setError}
            />
          )}

          {pestana === 'resultados' && (
            <ContactosPanel
              laboratorio={lab.codigo}
              contactos={contactosDelLab}
              secciones={[
                {
                  tipo: 'resultado_cliente',
                  titulo: 'Destinatarios del cliente',
                  nota: 'El laboratorio envía los resultados a estos correos del cliente.',
                },
                {
                  tipo: 'resultado_interno',
                  titulo: 'Copia interna AgroFresh',
                  nota: 'Correos nuestros que también reciben los resultados.',
                },
              ]}
              onCambio={(delLab) =>
                setContactos([...contactos.filter((c) => c.laboratorio !== lab.codigo), ...delLab])
              }
              onError={setError}
            />
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
