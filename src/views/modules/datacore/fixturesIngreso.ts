import type { Bandeja, InformeCorreo, PanelIngreso } from '@/features/correoInformes'

export const INFORME_ROJO: InformeCorreo = {
  id: 1,
  laboratorio: 'Quiteca',
  soportado: true,
  nro_informe: '2026-1914-PC',
  ot: 'OT-QUI0053',
  sold_to: 'FRUTAS AGROVIC LIMITADA',
  ship_to: 'FRUTAS AGROVIC LIMITADA',
  especie: 'cereza',
  fecha_muestreo: '2026-10-14',
  asunto: 'Informe Quiteca 2026-1914-PC (16/10/2026)',
  remitente: 'informes@quiteca.cl',
  llegada_en: '2026-10-20T20:21:00Z',
  enviado_en: '2026-10-20T20:21:00Z',
  estado: 'rojo',
  ya_cargado: false,
  decision: 'pendiente',
  decidido_en: null,
  decidido_por: null,
  nota: null,
  resuelto_en: null,
  resuelto_por: null,
  primera_llegada: '2026-10-16T18:03:00Z',
  es_ultima_copia: true,
  envios: 2,
  tuvo_incidente: true,
  informado: false,
  informado_en: null,
  informado_por: null,
  nota_incidente: null,
  hallazgos: [{ nivel: 'rojo', codigo: 'destinatarios_de_mas', texto: 'Salió a personas que NO están en la lista de la solicitud: patricio@unifrutti.com' }],
  pdf_nombre: '2026-1914-PC.pdf',
  tiene_pdf: true,
}

export const INFORME_OK: InformeCorreo = {
  ...INFORME_ROJO,
  id: 2,
  nro_informe: '2026-1912-PC',
  ot: 'OT-QUI0051',
  sold_to: 'COMERCIALIZADORA EL MORAL LIMITADA',
  ship_to: 'COMERCIALIZADORA EL MORAL LIMITADA',
  estado: 'ok',
  ya_cargado: true,
  hallazgos: [],
  primera_llegada: null,
  envios: 1,
  tuvo_incidente: false,
  informado: false,
}

export function bandeja(informes: InformeCorreo[]): Bandeja {
  return {
    conteos: { todos: informes.length, rojo: 1, amarillo: 0, ok: 1, ya_cargado: 1, pendiente: 2, aceptado: 3, rechazado: 1 },
    informes,
    ultimo_sondeo: { id: 1, iniciado_en: '2026-10-21T10:00:00Z', terminado_en: '2026-10-21T10:00:05Z', nuevos: 2, examinados: 5, error: null, dias: 14 },
  }
}

export const PANEL: PanelIngreso = {
  dias: 60,
  kpis: { recibidos: 9, pendientes: 4, aceptados: 3, rechazados: 1, incidentes: 3, incidentes_abiertos: 2, incidentes_cerrados: 1, incidentes_por_informar: 1, esperando: 2, demora_mediana: 2.5, demora_maxima: 6 },
  tendencia: {
    puntos: [
      { semana: '2026-10-05', n: 3, mediana: 2, por_laboratorio: { Quiteca: 2 } },
      { semana: '2026-10-12', n: 4, mediana: 3, por_laboratorio: { Quiteca: 3, ALS: 4 } },
    ],
    laboratorios: ['ALS', 'Quiteca'],
    pendiente_por_semana: 1,
    recta: [2, 3],
  },
  laboratorios: [
    { laboratorio: 'ALS', esperando: 1, recibidos: 2, demora_mediana: 4 },
    { laboratorio: 'Quiteca', esperando: 1, recibidos: 5, demora_mediana: 2 },
  ],
  solicitudes: [
    { ot: 'OT-QUI0053', laboratorio: 'Quiteca', sold_to: 'FRUTAS AGROVIC LIMITADA', ship_to: 'FRUTAS AGROVIC LIMITADA', especie: 'Cereza',
      enviada_en: '2026-10-15T14:00:00Z', estado: 'esperando', dias_esperando: 4.5, llegada_en: null, demora: null, informe_id: null, nro_informe: null, decision: null },
    { ot: 'OT-ALS0019', laboratorio: 'ALS', sold_to: 'COMERCIALIZADORA EL MORAL LIMITADA', ship_to: null, especie: null,
      enviada_en: '2026-10-09T14:00:00Z', estado: 'esperando', dias_esperando: 8, llegada_en: null, demora: null, informe_id: null, nro_informe: null, decision: null },
    { ot: 'OT-QUI0051', laboratorio: 'Quiteca', sold_to: 'COMERCIALIZADORA EL MORAL LIMITADA', ship_to: 'COMERCIALIZADORA EL MORAL LIMITADA', especie: 'Manzana',
      enviada_en: '2026-10-10T14:00:00Z', estado: 'recibido', dias_esperando: null, llegada_en: '2026-10-20T20:19:00Z', demora: 6, informe_id: 2, nro_informe: '2026-1912-PC', decision: 'pendiente' },
    { ot: 'OT-QUI0050', laboratorio: 'Quiteca', sold_to: 'DOLE CHILE S.A.', ship_to: 'DOLE PLANTA CODEGUA', especie: 'Cereza',
      enviada_en: '2026-10-08T14:00:00Z', estado: 'cargado', dias_esperando: null, llegada_en: '2026-10-15T18:35:00Z', demora: 5, informe_id: 3, nro_informe: '2026-1911-PC', decision: 'aceptado' },
  ],
}
