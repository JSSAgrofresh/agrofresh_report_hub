import { useEffect, useRef, useState } from 'react'
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { IconoBuscar, IconoCerrar } from '@/components/ui/iconosAccion'
import { FILTROS_VACIOS, chipsDeFiltros, contarFiltros } from '@/features/auditoriaInterna'
import type { FiltrosSolicitudes, OpcionesFiltros, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { tipoServicioDe } from '@/features/auditoriaInterna'
import { colorDeIngrediente } from '@/features/reportes'
import styles from './PanelFiltros.module.css'

/** A cuántos px del borde de arriba se pega la barra al bajar. */
const TOPE_PEGADO = 8

const CLAVE_VISIBLE = 'agrofresh.auditoria.filtros.visibles'

function leerVisible(): boolean {
  try {
    return localStorage.getItem(CLAVE_VISIBLE) !== '0'
  } catch {
    return true // sin almacenamiento (modo privado): abiertos, como de costumbre
  }
}

function guardarVisible(v: boolean) {
  try {
    localStorage.setItem(CLAVE_VISIBLE, v ? '1' : '0')
  } catch {
    /* no pasa nada: solo se pierde recordar la preferencia */
  }
}

/** Cuántas solicitudes trae cada opción, para ponerlo al lado en las listas. */
function conteo(lista: SolicitudAuditoria[], valor: (s: SolicitudAuditoria) => string | null | undefined) {
  const por = new Map<string, number>()
  for (const s of lista) {
    const v = (valor(s) ?? '').trim()
    if (v) por.set(v, (por.get(v) ?? 0) + 1)
  }
  return (o: string) => por.get(o)
}

/**
 * Los filtros del panel, como los de Report: para ir de lo general a lo
 * específico. Se pueden ocultar (y se recuerda) sin perder lo que está puesto:
 * los filtros activos siguen a la vista como chips que se quitan de a uno.
 * Todo lo de abajo -donas, gráficos y tabla- se recalcula con ellos.
 */
export function PanelFiltros({
  filtros,
  onChange,
  opciones,
  datos,
  coinciden,
}: {
  filtros: FiltrosSolicitudes
  onChange: (f: FiltrosSolicitudes) => void
  opciones: OpcionesFiltros
  /** todas las solicitudes, para los números junto a cada opción */
  datos: SolicitudAuditoria[]
  /** cuántas solicitudes dejan pasar los filtros */
  coinciden: number
}) {
  const [visible, setVisible] = useState(leerVisible)
  // Al bajar, la tarjeta se pega arriba como una barra delgada que acompaña todo el recorrido; «Mostrar filtros» la despliega encima.
  const hueco = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const pegadoRef = useRef(false)
  const [pegado, setPegado] = useState(false)
  const [abiertoPegado, setAbiertoPegado] = useState(false)
  const [alto, setAlto] = useState<number | undefined>()
  const [geo, setGeo] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      const h = hueco.current
      const p = panel.current
      if (!h || !p) return
      const r = h.getBoundingClientRect()
      // En la parte de arriba de la página (scrollY 0) nunca se pega.
      const debePegar = window.scrollY > 0 && r.top <= TOPE_PEGADO
      if (!pegadoRef.current && debePegar) {
        pegadoRef.current = true
        setAlto(p.offsetHeight)
        setPegado(true)
      } else if (pegadoRef.current && !debePegar) {
        pegadoRef.current = false
        setPegado(false)
        setAbiertoPegado(false)
        setAlto(undefined)
      }
      if (pegadoRef.current) setGeo((g) => (g && g.left === r.left && g.width === r.width ? g : { left: r.left, width: r.width }))
    }
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir)
    }
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    pedir()
    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [])

  const cuerpoAbierto = pegado ? abiertoPegado : visible
  const estiloFijo = pegado && geo ? { top: TOPE_PEGADO, left: geo.left, width: geo.width } : undefined
  const activos = contarFiltros(filtros)
  const chips = chipsDeFiltros(filtros)
  const conteoAnalito = (a: string) => datos.filter((s) => s.analitos.includes(a)).length
  const cambiar = <K extends keyof FiltrosSolicitudes>(clave: K, valor: FiltrosSolicitudes[K]) => {
    const siguiente = { ...filtros, [clave]: valor }
    // Al cambiar el cliente, la planta elegida puede dejar de ser de él; igual con especie y variedad.
    if (clave === 'cliente') siguiente.planta = []
    if (clave === 'especie') siguiente.variedad = []
    onChange(siguiente)
  }

  return (
    <div ref={hueco} className={styles.hueco} style={pegado && alto ? { height: alto } : undefined}>
    <section ref={panel} className={`${styles.panel} ${pegado ? styles.fijo : ''}`} style={estiloFijo} aria-label="Filtros" data-pegado={pegado ? 'true' : 'false'}>
      <header className={styles.cabecera}>
        <h2>
          Filtros
          {activos > 0 && <span className={styles.contador} aria-label={`${activos} filtros activos`}>{activos}</span>}
          <span className={styles.cuenta}>{coinciden.toLocaleString('es-CL')} de {datos.length.toLocaleString('es-CL')} solicitudes</span>
        </h2>
        <div className={styles.acciones}>
          {activos > 0 && (
            <button type="button" className={styles.limpiar} onClick={() => onChange({ ...FILTROS_VACIOS })}>
              <IconoCerrar width={14} height={14} /> Limpiar todo
            </button>
          )}
          <button
            type="button"
            className={styles.alternar}
            aria-expanded={cuerpoAbierto}
            onClick={() => {
              if (pegado) {
                setAbiertoPegado((v) => !v)
                return
              }
              setVisible(!visible)
              guardarVisible(!visible)
            }}
          >
            {cuerpoAbierto ? 'Ocultar filtros ▴' : 'Mostrar filtros ▾'}
          </button>
        </div>
      </header>

      {cuerpoAbierto && (
        <>
        <p className={styles.grupo}>Generales <span>· valen para todo el panel; cada gráfico tiene sus propios controles</span></p>
        <div className={styles.cuerpo}>
          <label className={styles.buscar}>
            <span className={styles.etiqueta}>Buscar</span>
            <span className={styles.cajaBuscar}>
              <IconoBuscar className={styles.lupa} width={15} height={15} />
              <input
                type="search"
                placeholder="OT, N° de informe, cliente, analito…"
                value={filtros.texto}
                onChange={(e) => cambiar('texto', e.target.value)}
              />
            </span>
          </label>
          <MultiSelectFiltro etiqueta="Cliente (Sold To)" opciones={opciones.clientes} valores={filtros.cliente} onChange={(v) => cambiar('cliente', v)} conteoDe={conteo(datos, (s) => s.sold_to)} />
          <MultiSelectFiltro etiqueta="Sucursal (Ship To)" opciones={opciones.plantas} valores={filtros.planta} onChange={(v) => cambiar('planta', v)} conteoDe={conteo(datos, (s) => s.ship_to)} />
          <MultiSelectFiltro etiqueta="Laboratorio" opciones={opciones.laboratorios} valores={filtros.laboratorio} onChange={(v) => cambiar('laboratorio', v)} conteoDe={conteo(datos, (s) => s.laboratorio)} />
          <MultiSelectFiltro etiqueta="Tipo de servicio" opciones={opciones.tipos} valores={filtros.tipo} onChange={(v) => cambiar('tipo', v)} conteoDe={conteo(datos, (s) => (s.tipo_servicio ? tipoServicioDe(s) : ''))} />
          <CalendarioRango etiqueta="Fecha de emisión" valor={filtros.rango} onChange={(r) => cambiar('rango', r)} />
          <MultiSelectFiltro etiqueta="Especie" opciones={opciones.especies} valores={filtros.especie} onChange={(v) => cambiar('especie', v)} conteoDe={conteo(datos, (s) => s.especie)} />
          <MultiSelectFiltro etiqueta="Variedad" opciones={opciones.variedades} valores={filtros.variedad} onChange={(v) => cambiar('variedad', v)} conteoDe={conteo(datos, (s) => s.variedad)} />
          <MultiSelectFiltro
            etiqueta="Analitos pedidos"
            opciones={opciones.analitos}
            valores={filtros.analitos}
            onChange={(v) => cambiar('analitos', v)}
            colorDe={colorDeIngrediente}
            conteoDe={conteoAnalito}
          />
          <button
            type="button"
            className={`${styles.interruptor} ${filtros.sinEnvio ? styles.interruptorActivo : ''}`}
            aria-pressed={filtros.sinEnvio}
            onClick={() => cambiar('sinEnvio', !filtros.sinEnvio)}
          >
            Solo informes sin fecha de envío
          </button>
        </div>
        </>
      )}

      {chips.length > 0 && (!pegado || abiertoPegado) && (
        <ul className={styles.chips} aria-label="Filtros aplicados">
          {chips.map((c) => (
            <li key={c.clave}>
              <button
                type="button"
                className={styles.chip}
                title="Quitar este filtro"
                aria-label={`Quitar filtro: ${c.texto}`}
                onClick={() => cambiar(c.clave, FILTROS_VACIOS[c.clave])}
              >
                {c.texto}
                <IconoCerrar width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
    </div>
  )
}
