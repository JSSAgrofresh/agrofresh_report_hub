import { useMemo } from 'react'
import { FiltrosPegajosos } from '@/components/layout/portal/FiltrosPegajosos'
import { CalendarioRango } from '@/components/ui/CalendarioRango'
import { MultiSelectFiltro } from '@/components/ui/MultiSelectFiltro'
import { contarFiltros, etiquetaSemana, nombreEquipo, opcionesAccutab } from '@/features/postventa'
import type { CampoAccutab, FiltroAccutab, ResumenCargaTrace } from '@/features/postventa'
import estilos from './ReporteView.module.css'

const CAMPOS: { campo: CampoAccutab; etiqueta: string; formatear?: (v: string) => string }[] = [
  { campo: 'soldTo', etiqueta: 'Sold To' },
  { campo: 'shipTo', etiqueta: 'Ship To' },
  { campo: 'posicion', etiqueta: 'Posición de muestreo' },
  { campo: 'equipo', etiqueta: 'Equipo', formatear: nombreEquipo },
  { campo: 'semana', etiqueta: 'Semana', formatear: etiquetaSemana },
]

/**
 * La barra de filtros del reporte de Accu-Tab: la misma tarjeta (y la misma barra pegajosa del portal) que usa Report.
 * Sold To, Ship To, posición, equipo y semana admiten varios valores y se acotan entre sí; el rango de fechas va aparte.
 * Un filtro que no tiene nada que elegir (una cuenta con una sola planta) no se dibuja.
 */
export function FiltrosAccutab({
  todas,
  filtradas,
  filtro,
  onFiltro,
}: {
  todas: ResumenCargaTrace[]
  filtradas: ResumenCargaTrace[]
  filtro: FiltroAccutab
  onFiltro: (f: FiltroAccutab) => void
}) {
  const opciones = useMemo(
    () => Object.fromEntries(CAMPOS.map(({ campo }) => [campo, opcionesAccutab(todas, filtro, campo)])) as Record<CampoAccutab, string[]>,
    [todas, filtro],
  )
  const n = contarFiltros(filtro)
  const vacio = { soldTo: [], shipTo: [], posicion: [], equipo: [], semana: [], rango: null } satisfies FiltroAccutab

  const chips = [
    ...CAMPOS.flatMap(({ campo, etiqueta, formatear = (v: string) => v }) =>
      filtro[campo].map((v) => ({
        clave: `${campo}:${v}`,
        etiqueta,
        valor: formatear(v),
        quitar: () => onFiltro({ ...filtro, [campo]: filtro[campo].filter((x) => x !== v) }),
      })),
    ),
    ...(filtro.rango
      ? [{ clave: 'rango', etiqueta: 'Fechas', valor: `${filtro.rango.desde} → ${filtro.rango.hasta}`, quitar: () => onFiltro({ ...filtro, rango: null }) }]
      : []),
  ]

  return (
    <FiltrosPegajosos className={estilos.filtrosCard}>
      <div className={estilos.filtrosCabecera}>
        <span className={estilos.filtrosTitulo}>
          Filtros
          {n > 0 && <span className={estilos.filtrosContador}>{n}</span>}
        </span>
        <span className={estilos.filtrosResumen}>
          {filtradas.length.toLocaleString('es-CL')} de {todas.length.toLocaleString('es-CL')} informes
        </span>
        {n > 0 && (
          <button type="button" className={estilos.limpiar} onClick={() => onFiltro(vacio)}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={estilos.filtros}>
        {CAMPOS.map(({ campo, etiqueta, formatear }) =>
          opciones[campo].length > 1 || filtro[campo].length > 0 ? (
            <MultiSelectFiltro
              key={campo}
              etiqueta={etiqueta}
              opciones={opciones[campo]}
              valores={filtro[campo]}
              formatear={formatear}
              onChange={(valores) => onFiltro({ ...filtro, [campo]: valores })}
            />
          ) : null,
        )}
        <CalendarioRango etiqueta="Rango de fechas" valor={filtro.rango} onChange={(rango) => onFiltro({ ...filtro, rango })} />
      </div>

      {chips.length > 0 && (
        <div className={estilos.chips}>
          {chips.map((chip) => (
            <button key={chip.clave} type="button" className={estilos.chip} onClick={chip.quitar} title={`Quitar filtro ${chip.etiqueta}`}>
              <span className={estilos.chipEtiqueta}>{chip.etiqueta}:</span> {chip.valor}
              <span className={estilos.chipX} aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}
    </FiltrosPegajosos>
  )
}
