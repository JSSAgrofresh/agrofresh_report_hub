import { useEffect, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { VISTAS_ENVIOS, contarVistas, filtrarEnvios, listarEnviosInformes } from '@/features/auditoriaInterna'
import type { EnvioInforme, TipoEnvio, VistaEnvios } from '@/features/auditoriaInterna'
import { fechaHora } from '@/lib/fechaHoraChile'
import { AuditoriaHero } from './AuditoriaHero'
import styles from './EnviosInformesView.module.css'

const ETIQUETA_TIPO: Record<TipoEnvio, string> = { real: 'Cliente', prueba: 'Prueba', manual: 'A mano' }

function Destinatarios({ e }: { e: EnvioInforme }) {
  if (e.tipo === 'manual') return <span className={styles.tenue}>Marcado a mano, sin registro de destinatarios</span>
  if (e.enviado_a.length === 0 && e.pedido_a.length === 0) return <span className={styles.tenue}>—</span>
  return (
    <div className={styles.destinatarios}>
      {e.enviado_a.length > 0 && <span>{e.enviado_a.join(', ')}</span>}
      {e.tipo === 'prueba' && e.pedido_a.length > 0 && (
        <span className={styles.tenue}>Se habría enviado a: {e.pedido_a.join(', ')}</span>
      )}
    </div>
  )
}

/** Auditoría de informes enviados a clientes: qué informe salió, a quién, cuándo y quién lo envió, y si fue real, de prueba o marcado a mano. */
export function EnviosInformesView() {
  const [envios, setEnvios] = useState<EnvioInforme[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaEnvios>('real')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let cancelado = false
    listarEnviosInformes()
      .then((r) => {
        if (!cancelado) setEnvios(r)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar la auditoría de envíos.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const cuentas = useMemo(() => contarVistas(envios ?? []), [envios])
  const visibles = useMemo(() => filtrarEnvios(envios ?? [], vista, texto), [envios, vista, texto])

  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        etiqueta="Panel de control interno"
        titulo="Informes enviados a clientes"
        descripcion="Qué informe salió, a quién, cuándo y quién lo envió, y si fue un envío real, una prueba o un informe marcado a mano."
      />

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.barra}>
        <div className={styles.vistas} role="group" aria-label="Tipo de envío">
          {VISTAS_ENVIOS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={styles.vista}
              aria-pressed={vista === v.id}
              onClick={() => setVista(v.id)}
            >
              {v.etiqueta}
              <span className={styles.conteo}>{cuentas[v.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Buscar por solicitud, cliente, planta, destinatario o quién lo envió"
          aria-label="Buscar envíos"
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
        />
      </div>

      {envios === null && !error ? (
        <Skeleton style={{ height: 220 }} />
      ) : (
        <div className={styles.tablaWrap}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Solicitud / informe</th>
                <th>Cliente y planta</th>
                <th>Enviado a</th>
                <th>Enviado por</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.vacio}>
                    {envios && envios.length > 0 ? 'Ningún envío coincide con lo que buscas.' : 'Todavía no hay envíos registrados.'}
                  </td>
                </tr>
              ) : (
                visibles.map((e) => (
                  <tr key={e.id}>
                    <td className={styles.fecha}>{fechaHora(e.fecha)}</td>
                    <td><span className={`${styles.tipo} ${styles[e.tipo]}`}>{ETIQUETA_TIPO[e.tipo]}</span></td>
                    <td>
                      <div className={styles.doble}>
                        <span className={styles.codigo}>{e.solicitud ?? 'Sin solicitud'}</span>
                        {e.informe && <span className={styles.tenue}>{e.informe}</span>}
                        {e.laboratorio && <span className={styles.tenue}>{e.laboratorio}</span>}
                      </div>
                    </td>
                    <td>
                      <div className={styles.doble}>
                        <span>{e.sold_to ?? '—'}</span>
                        <span className={styles.tenue}>{e.ship_to ?? '—'}{e.especie ? ` · ${e.especie}` : ''}</span>
                      </div>
                    </td>
                    <td><Destinatarios e={e} /></td>
                    <td>
                      <div className={styles.doble}>
                        <span>{e.enviado_por ?? '—'}</span>
                        <span className={styles.tenue}>{e.origen}</span>
                      </div>
                    </td>
                    <td>
                      {e.exitoso ? (
                        <span className={styles.ok}>{e.tipo === 'manual' ? 'Marcado' : 'Enviado'}</span>
                      ) : (
                        <span className={styles.fallo} title={e.error ?? undefined}>Falló{e.error ? `: ${e.error}` : ''}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
