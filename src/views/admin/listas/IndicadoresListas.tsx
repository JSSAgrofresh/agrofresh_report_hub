import { useId } from 'react'
import { IconoAlerta } from '@/components/ui/iconosAccion'
import { ETIQUETA_FILTRO_TABLA } from '@/features/listasDistribucion'
import type { EstadoListas, FiltroTabla, Indicadores } from '@/features/listasDistribucion'
import styles from './IndicadoresListas.module.css'

const nf = new Intl.NumberFormat('es-CL')

interface Props {
  ind: Indicadores
  resumen: EstadoListas['resumen']
  filtro: FiltroTabla
  onFiltro: (f: FiltroTabla) => void
}

const ALERTAS: { filtro: Exclude<FiltroTabla, 'todas' | 'cambios'>; ayuda: string }[] = [
  { filtro: 'sin_tecnico', ayuda: 'Nadie en copia oculta que haga seguimiento técnico.' },
  { filtro: 'sin_comercial', ayuda: 'Nadie del área comercial en copia.' },
  { filtro: 'sin_cliente', ayuda: 'Los resultados llegan solo a Jorge, Claudia y el Report Hub: el cliente no recibe nada.' },
  { filtro: 'fuera_listados', ayuda: 'El nombre no existe en Listados: ninguna solicitud encontrará estos contactos.' },
  { filtro: 'copia_mal', ayuda: 'Un técnico o admin va en copia visible, o un comercial en copia oculta.' },
  { filtro: 'sin_lista_listados', ayuda: 'Plantas de Listados que todavía no tienen ningún contacto.' },
]

/** Globito que aparece suave al pasar el mouse (o enfocar con el teclado / tocar) sobre un recuadro. */
function Explicacion({ id, alineado, children }: { id: string; alineado?: 'derecha'; children: React.ReactNode }) {
  return (
    <div id={id} role="tooltip" className={`${styles.detalle} ${alineado === 'derecha' ? styles.detalleDerecha : ''}`}>
      {children}
    </div>
  )
}

function Cobertura({ titulo, ayuda, que, n, de, alineado }: {
  titulo: string; ayuda: string; que: string; n: number; de: number; alineado?: 'derecha'
}) {
  const pct = de > 0 ? Math.round((n / de) * 100) : 0
  const id = useId()
  return (
    <div className={styles.tile} role="group" aria-label={titulo} tabIndex={0} aria-describedby={id}>
      <span className={styles.titulo}>{titulo}</span>
      <span className={styles.numero}>
        {nf.format(n)} <small>de {nf.format(de)}</small>
      </span>
      <div className={styles.pista} role="img" aria-label={`${pct}% de las plantas`}>
        <div className={styles.relleno} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.ayuda}>{pct}% · {ayuda}</span>
      <Explicacion id={id} alineado={alineado}>
        <b>{titulo}</b>
        <span>{que}</span>
        <span>El porcentaje se mide sobre las plantas con lista.</span>
      </Explicacion>
    </div>
  )
}

/** El panel de arriba: qué tan completas están las listas y dónde mirar primero. */
export function IndicadoresListas({ ind, resumen, filtro, onFiltro }: Props) {
  const idPlantas = useId()
  return (
    <section className={styles.panel} aria-label="Estado de las listas de distribución">
      <div className={styles.tiles}>
        <div className={styles.tile} role="group" aria-label="Plantas con lista" tabIndex={0} aria-describedby={idPlantas}>
          <span className={styles.titulo}>Plantas con lista</span>
          <span className={styles.numero}>{nf.format(ind.plantas)}</span>
          <span className={styles.ayuda}>
            {resumen.plantas_listados != null
              ? `de ${nf.format(resumen.plantas_listados)} en Listados reciben el correo de resultados`
              : 'reciben el correo de resultados'}
          </span>
          <Explicacion id={idPlantas}>
            <b>Plantas con lista</b>
            <span>
              Plantas que tienen al menos un contacto de resultados cargado (cliente, comercial, técnico o admin).
              Se compara con las plantas activas del listado oficial (Sold To / Ship To).
            </span>
          </Explicacion>
        </div>
        <Cobertura titulo="Correos del cliente · Para" ayuda="reciben los resultados" n={ind.conCliente} de={ind.plantas}
          que="De las plantas con lista, cuántas tienen al menos un correo del cliente en alguna especie. Esos correos van en Para." />
        <Cobertura titulo="Comercial · Copia" ayuda="tienen ejecutivo en copia" n={ind.conComercial} de={ind.plantas}
          que="Plantas con ejecutivo comercial. Va en copia visible." />
        <Cobertura titulo="Técnico · Copia oculta" ayuda="tienen técnico asignado" n={ind.conTecnico} de={ind.plantas} alineado="derecha"
          que="Plantas con técnico asignado. Va en copia oculta." />
        <Cobertura titulo="Admin Report Hub · Copia oculta" ayuda="incluyen al sistema" n={ind.conAdmin} de={ind.plantas} alineado="derecha"
          que="Plantas que incluyen a Jorge, Claudia y el correo del sistema. Van en copia oculta." />
      </div>

      <div className={styles.alertas}>
        <span className={styles.preg}>¿Qué miro primero?</span>
        {ALERTAS.map(({ filtro: f, ayuda }) => {
          const n = ind.alertas[f]
          const activo = filtro === f
          return (
            <button
              key={f}
              type="button"
              className={`${styles.alerta} ${n > 0 ? styles.hay : styles.ok} ${activo ? styles.activa : ''}`}
              aria-pressed={activo}
              title={ayuda}
              onClick={() => onFiltro(activo ? 'todas' : f)}
            >
              {n > 0 ? <IconoAlerta width={14} height={14} /> : <span aria-hidden>✓</span>}
              {ETIQUETA_FILTRO_TABLA[f]}
              <b>{nf.format(n)}</b>
            </button>
          )
        })}
      </div>
    </section>
  )
}
