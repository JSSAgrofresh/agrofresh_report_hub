import { useState } from 'react'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { IconoBuscar, IconoCerrar } from '@/components/ui/iconosAccion'
import { FILTROS_VACIOS, chipsDeFiltros, contarFiltros } from '@/features/auditoriaInterna'
import type { FiltrosSolicitudes, OpcionesFiltros, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { tipoServicioDe } from '@/features/auditoriaInterna'
import styles from './PanelFiltros.module.css'

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
}: {
  filtros: FiltrosSolicitudes
  onChange: (f: FiltrosSolicitudes) => void
  opciones: OpcionesFiltros
  /** todas las solicitudes, para los números junto a cada opción */
  datos: SolicitudAuditoria[]
}) {
  const [visible, setVisible] = useState(leerVisible)
  const activos = contarFiltros(filtros)
  const chips = chipsDeFiltros(filtros)
  const cambiar = <K extends keyof FiltrosSolicitudes>(clave: K, valor: FiltrosSolicitudes[K]) => {
    const siguiente = { ...filtros, [clave]: valor }
    // Al cambiar el cliente, la planta elegida puede dejar de ser de él; igual con especie y variedad.
    if (clave === 'cliente') siguiente.planta = ''
    if (clave === 'especie') siguiente.variedad = ''
    onChange(siguiente)
  }

  return (
    <section className={styles.panel} aria-label="Filtros">
      <header className={styles.cabecera}>
        <h2>
          Filtros
          {activos > 0 && <span className={styles.contador} aria-label={`${activos} filtros activos`}>{activos}</span>}
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
            aria-expanded={visible}
            onClick={() => {
              setVisible(!visible)
              guardarVisible(!visible)
            }}
          >
            {visible ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>
      </header>

      {visible && (
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
          <BuscableSelect etiqueta="Laboratorio" opciones={opciones.laboratorios} valor={filtros.laboratorio} onChange={(v) => cambiar('laboratorio', v)} conteoDe={conteo(datos, (s) => s.laboratorio)} />
          <BuscableSelect etiqueta="Cliente (Sold To)" opciones={opciones.clientes} valor={filtros.cliente} onChange={(v) => cambiar('cliente', v)} conteoDe={conteo(datos, (s) => s.sold_to)} />
          <BuscableSelect etiqueta="Planta (Ship To)" opciones={opciones.plantas} valor={filtros.planta} onChange={(v) => cambiar('planta', v)} conteoDe={conteo(datos, (s) => s.ship_to)} />
          <BuscableSelect etiqueta="Tipo de servicio" opciones={opciones.tipos} valor={filtros.tipo} onChange={(v) => cambiar('tipo', v)} conteoDe={conteo(datos, (s) => (s.tipo_servicio ? tipoServicioDe(s) : ''))} />
          <BuscableSelect etiqueta="Especie" opciones={opciones.especies} valor={filtros.especie} onChange={(v) => cambiar('especie', v)} conteoDe={conteo(datos, (s) => s.especie)} />
          <BuscableSelect etiqueta="Variedad" opciones={opciones.variedades} valor={filtros.variedad} onChange={(v) => cambiar('variedad', v)} conteoDe={conteo(datos, (s) => s.variedad)} />
          <MultiSelectFiltro
            etiqueta="Analitos pedidos"
            opciones={opciones.analitos}
            valores={filtros.analitos}
            onChange={(v) => cambiar('analitos', v)}
            conteoDe={(a) => datos.filter((s) => s.analitos.includes(a)).length}
          />
          <CalendarioRango etiqueta="Fecha de emisión" valor={filtros.rango} onChange={(r) => cambiar('rango', r)} />
          <button
            type="button"
            className={`${styles.interruptor} ${filtros.sinEnvio ? styles.interruptorActivo : ''}`}
            aria-pressed={filtros.sinEnvio}
            onClick={() => cambiar('sinEnvio', !filtros.sinEnvio)}
          >
            Solo informes sin fecha de envío
          </button>
        </div>
      )}

      {chips.length > 0 && (
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
  )
}
